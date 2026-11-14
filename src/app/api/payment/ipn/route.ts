import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validatePayment } from "@/lib/sslcommerz";

/**
 * POST /api/payment/ipn
 *
 * Instant Payment Notification (IPN) Webhook Handler.
 * SSLCommerz sends an asynchronous server-to-server `multipart/form-data`
 * (or URL-encoded) POST here even if the customer closes their browser before
 * returning to the success page.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const valId = String(formData.get("val_id") || "");
    const tranId = String(formData.get("tran_id") || "");

    if (!valId) {
      return NextResponse.json({ error: "Missing val_id" }, { status: 400 });
    }

    const validation = await validatePayment(valId);

    if (validation.valid) {
      const targetTranId = tranId || String(validation.data?.tran_id || "");
      if (targetTranId) {
        await prisma.payment.updateMany({
          where: { transactionId: targetTranId, paymentStatus: "pending" },
          data: { paymentStatus: "verified" },
        });
      }

      return NextResponse.json({
        status: "success",
        message: "IPN validated and recorded",
      });
    }

    return NextResponse.json(
      { status: "failed", message: validation.error || "IPN validation failed" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Payment IPN] Error:", error);
    return NextResponse.json({ error: "IPN processing failed" }, { status: 500 });
  }
}

