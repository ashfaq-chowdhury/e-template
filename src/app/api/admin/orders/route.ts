import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/auth";

/**
 * GET /api/admin/orders
 * Protected by Layer 2 RBAC (`isAdminRequest`): verifies JWT + PostgreSQL `isAdmin`.
 * Returns both physical merchandise `Order` records and event `TicketOrder` records
 * with nested user, product, event, and ticketType relations.
 */
export async function GET(request: NextRequest) {
  const auth = await isAdminRequest(request);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const [productOrders, ticketOrders] = await Promise.all([
      prisma.order.findMany({
        include: {
          items: { include: { product: true } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.ticketOrder.findMany({
        include: {
          event: true,
          ticketType: true,
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ productOrders, ticketOrders });
  } catch (error) {
    console.error("[Admin Orders GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/orders
 * Allows administrators to fulfill domain-specific actions:
 * - `orderType: "ticket"` -> assign `seatNumber` on `TicketOrder`
 * - `orderType: "product"` -> toggle `merchFulfilled` on `Order`
 */
export async function PATCH(request: NextRequest) {
  const auth = await isAdminRequest(request);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { orderId, orderType, seatNumber, merchFulfilled } = await request.json();

    if (!orderId || !["ticket", "product"].includes(orderType)) {
      return NextResponse.json(
        { error: "Provide orderId and orderType ('ticket' or 'product')" },
        { status: 400 }
      );
    }

    if (orderType === "ticket") {
      const updated = await prisma.ticketOrder.update({
        where: { id: orderId },
        data: { ...(seatNumber !== undefined && { seatNumber }) },
      });
      return NextResponse.json({ message: "Seat assigned", order: updated });
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { ...(merchFulfilled !== undefined && { merchFulfilled }) },
    });
    return NextResponse.json({ message: "Fulfillment updated", order: updated });
  } catch (error) {
    console.error("[Admin Orders PATCH] Error:", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

