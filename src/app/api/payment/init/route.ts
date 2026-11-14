import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTransactionId, initializePayment } from "@/lib/sslcommerz";

/**
 * POST /api/payment/init
 *
 * Step 1 of the Unified Cart -> Split Fulfillment Pipeline:
 * 1. Receives a mixed cart containing physical merch (`isTicket: false`) and/or
 *    event tickets (`isTicket: true`).
 * 2. Persists a staging `Payment` record in PostgreSQL BEFORE redirecting away
 *    to SSLCommerz—because payment gateways only return `tran_id` & `val_id`,
 *    not our full cart structure.
 * 3. Calls SSLCommerz session API and returns the hosted `GatewayPageURL`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, totalAmount, userEmail, userName, userPhone, userId } = body;

    if (!Array.isArray(items) || items.length === 0 || !totalAmount || !userEmail) {
      return NextResponse.json(
        { error: "Missing required fields: items, totalAmount, userEmail" },
        { status: 400 }
      );
    }

    const tranId = generateTransactionId();
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    // 1. Save staging Payment record so verify/IPN handlers can reconstruct the cart
    await prisma.payment.create({
      data: {
        transactionId: tranId,
        userId: userId || "guest",
        totalAmount: Number(totalAmount),
        paymentMethod: "sslcommerz",
        cartItems: JSON.stringify(items),
        userEmail,
        userName: userName || "Customer",
        userPhone: userPhone || "N/A",
        paymentStatus: "pending",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30-minute checkout TTL
      },
    });

    // 2. Request hosted checkout URL from SSLCommerz
    const productSummary = items
      .map((item: { name: string }) => item.name)
      .slice(0, 3)
      .join(", ");

    const gatewayResponse = await initializePayment({
      total_amount: Number(totalAmount),
      currency: "BDT",
      tran_id: tranId,
      success_url: `${baseUrl}/?payment=success&tran_id=${tranId}`,
      fail_url: `${baseUrl}/?payment=failed&tran_id=${tranId}`,
      cancel_url: `${baseUrl}/?payment=cancelled&tran_id=${tranId}`,
      ipn_url: `${baseUrl}/api/payment/ipn`,
      cus_name: userName || "Customer",
      cus_email: userEmail,
      cus_phone: userPhone || "N/A",
      product_name: productSummary,
      product_category: "ECOMMERCE",
    });

    const isSuccess = String(gatewayResponse.status || "").toUpperCase() === "SUCCESS";
    if (!isSuccess || !gatewayResponse.GatewayPageURL) {
      // Roll back the staging record if gateway initialization failed
      await prisma.payment.delete({ where: { transactionId: tranId } });
      return NextResponse.json(
        {
          error: gatewayResponse.failedreason || "Gateway initialization failed",
          gatewayResponse,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: "success",
      transactionId: tranId,
      redirectUrl: gatewayResponse.GatewayPageURL,
    });
  } catch (error) {
    console.error("[Payment Init] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment init failed" },
      { status: 500 }
    );
  }
}

