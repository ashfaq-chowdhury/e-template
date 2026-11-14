import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validatePayment } from "@/lib/sslcommerz";

interface CartItem {
  id?: string;
  productId?: string;
  name: string;
  quantity: number;
  price: number;
  isTicket?: boolean;
  eventId?: string;
  ticketTypeId?: string;
}

/**
 * POST /api/payment/verify
 *
 * Step 2 of the Unified Cart -> Split Fulfillment Pipeline:
 * 1. Performs server-to-server validation against SSLCommerz using `val_id`.
 * 2. Loads the staging `Payment` record from PostgreSQL and parses `cartItems`.
 * 3. Splits mixed carts into two separate domain workflows:
 *    - Merch items -> `Order` + `OrderItem[]` (transactionId gets `-MERCH` suffix if mixed)
 *    - Ticket items -> `TicketOrder` per tier (transactionId gets `-TKT{i}` suffix)
 *    This keeps `@unique` constraints intact across tables while tracing back to `tran_id`.
 */
export async function POST(request: NextRequest) {
  try {
    const { val_id, tran_id } = await request.json();

    if (!val_id) {
      return NextResponse.json({ error: "Missing val_id" }, { status: 400 });
    }

    // 1. Server-to-server verification with SSLCommerz
    const validation = await validatePayment(val_id);
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        { error: validation.error || "Payment validation failed" },
        { status: 400 }
      );
    }

    const transactionId = tran_id || validation.data.tran_id || "";
    const paymentRecord = await prisma.payment.findUnique({
      where: { transactionId },
    });

    if (!paymentRecord) {
      return NextResponse.json(
        { error: "Staging payment record not found", tran_id: transactionId },
        { status: 404 }
      );
    }

    // Idempotency guard: prevent duplicate order creation if verify runs twice
    if (paymentRecord.paymentStatus === "completed") {
      return NextResponse.json({
        status: "already_verified",
        tran_id: transactionId,
        amount: validation.data.amount,
      });
    }

    // 2. Parse serialized cart and split into physical merch vs event tickets
    const cartItems: CartItem[] = JSON.parse(paymentRecord.cartItems);
    const productItems = cartItems.filter((item) => !item.isTicket);
    const ticketItems = cartItems.filter((item) => item.isTicket);

    let createdMerchOrderId: string | null = null;
    const createdTicketOrderIds: string[] = [];

    // 3A. Fulfill physical merchandise items into `Order` + `OrderItem`
    if (productItems.length > 0) {
      const productTotal = productItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      const merchTxnId =
        ticketItems.length > 0 ? `${transactionId}-MERCH` : transactionId;

      const merchOrder = await prisma.order.create({
        data: {
          userId: paymentRecord.userId,
          orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          status: "completed",
          totalAmount: productTotal,
          paymentMethod: paymentRecord.paymentMethod,
          paymentStatus: "completed",
          transactionId: merchTxnId,
          phone: paymentRecord.userPhone,
          email: paymentRecord.userEmail,
          items: {
            create: productItems.map((item) => ({
              productId: item.productId || item.id || "",
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
      });
      createdMerchOrderId = merchOrder.id;
    }

    // 3B. Fulfill event ticket items into individual `TicketOrder` records
    for (let i = 0; i < ticketItems.length; i++) {
      const ticket = ticketItems[i];
      const ticketTxnId =
        ticketItems.length > 1 || productItems.length > 0
          ? `${transactionId}-TKT${i}`
          : transactionId;

      const ticketOrder = await prisma.ticketOrder.create({
        data: {
          userId: paymentRecord.userId,
          orderNumber: `TKT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          eventId: ticket.eventId || "",
          ticketTypeId: ticket.ticketTypeId || "",
          quantity: ticket.quantity,
          unitPrice: ticket.price,
          totalAmount: ticket.price * ticket.quantity,
          paymentMethod: paymentRecord.paymentMethod,
          paymentStatus: "completed",
          transactionId: ticketTxnId,
          status: "confirmed",
        },
      });
      createdTicketOrderIds.push(ticketOrder.id);
    }

    // 4. Mark parent staging payment completed
    await prisma.payment.update({
      where: { id: paymentRecord.id },
      data: { paymentStatus: "completed" },
    });

    return NextResponse.json({
      status: "verified",
      tran_id: transactionId,
      val_id: validation.data.val_id,
      amount: validation.data.amount,
      createdMerchOrderId,
      createdTicketOrderIds,
    });
  } catch (error) {
    console.error("[Payment Verify] Error:", error);
    return NextResponse.json(
      { error: "Failed to verify payment" },
      { status: 500 }
    );
  }
}

