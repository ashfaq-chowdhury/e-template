"use client";

import { useEffect, useState } from "react";

interface ProductOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  merchFulfilled: boolean;
  transactionId: string | null;
  user: { name: string; email: string };
}

interface TicketOrder {
  id: string;
  orderNumber: string;
  quantity: number;
  totalAmount: number;
  seatNumber: string | null;
  transactionId: string | null;
  event: { title: string };
  ticketType: { name: string };
  user: { name: string; email: string };
}

export default function AdminDashboardPage() {
  const [productOrders, setProductOrders] = useState<ProductOrder[]>([]);
  const [ticketOrders, setTicketOrders] = useState<TicketOrder[]>([]);
  const [seatInputs, setSeatInputs] = useState<Record<string, string>>({});
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const loadOrders = async () => {
    const res = await fetch("/api/admin/orders");
    const data = await res.json();
    if (!res.ok) {
      setStatusMessage(`Admin API blocked (${res.status}): ${data.error}`);
      return;
    }
    setProductOrders(data.productOrders || []);
    setTicketOrders(data.ticketOrders || []);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Assign seat number to a TicketOrder via PATCH /api/admin/orders
  const assignSeat = async (orderId: string) => {
    const seatNumber = seatInputs[orderId] || "";
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, orderType: "ticket", seatNumber }),
    });
    const data = await res.json();
    setStatusMessage(res.ok ? `Seat updated: ${seatNumber}` : data.error);
    if (res.ok) loadOrders();
  };

  // Toggle merchFulfilled on a physical product Order via PATCH /api/admin/orders
  const toggleMerchFulfilled = async (orderId: string, current: boolean) => {
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        orderType: "product",
        merchFulfilled: !current,
      }),
    });
    if (res.ok) {
      setStatusMessage("Merch fulfillment status updated.");
      loadOrders();
    }
  };

  // Cloud Media Pipeline: upload multipart image to Supabase Storage via POST /api/upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setStatusMessage("Uploading product image to Supabase Storage...");
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (res.ok) {
      setUploadedUrl(data.imageUrl);
      setStatusMessage(`Uploaded to Supabase CDN: ${data.imageUrl}`);
    } else {
      setStatusMessage(`Upload error: ${data.error}`);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Admin Dashboard &amp; Fulfillment</h1>
        <p className="mt-1 text-sm text-slate-600">
          Protected by Edge Middleware (<code>src/middleware.ts</code>) + DB-backed
          RBAC (<code>isAdminRequest</code>).
        </p>
        {statusMessage && (
          <div className="mt-4 rounded bg-slate-900 px-3 py-2 text-xs text-emerald-300">
            {statusMessage}
          </div>
        )}
      </section>

      {/* Cloud Media Uploader */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Supabase Cloud Media Upload</h2>
        <p className="mt-1 text-xs text-slate-500">
          Streams an image file through <code>POST /api/upload</code> into Supabase
          Storage bucket <code>product-images</code>.
        </p>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="mt-3 block text-sm"
        />
        {uploadedUrl && (
          <p className="mt-2 break-all text-xs text-emerald-700">
            CDN URL: {uploadedUrl}
          </p>
        )}
      </section>

      {/* Split Orders View */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Ticket Orders ({ticketOrders.length})
          </h2>
          <div className="mt-4 space-y-3">
            {ticketOrders.map((t) => (
              <div key={t.id} className="rounded border p-3 text-sm">
                <div className="font-semibold">
                  {t.orderNumber} — {t.event.title} ({t.ticketType.name})
                </div>
                <div className="text-xs text-slate-500">
                  {t.user.name} ({t.user.email}) • Qty: {t.quantity} • Txn:{" "}
                  {t.transactionId}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="w-28 rounded border px-2 py-1 text-xs"
                    placeholder="Seat (e.g. A-12)"
                    value={seatInputs[t.id] ?? t.seatNumber ?? ""}
                    onChange={(e) =>
                      setSeatInputs((prev) => ({ ...prev, [t.id]: e.target.value }))
                    }
                  />
                  <button
                    onClick={() => assignSeat(t.id)}
                    className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500"
                  >
                    Assign Seat
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Merchandise Orders ({productOrders.length})
          </h2>
          <div className="mt-4 space-y-3">
            {productOrders.map((o) => (
              <div key={o.id} className="rounded border p-3 text-sm">
                <div className="font-semibold">
                  {o.orderNumber} — BDT {o.totalAmount}
                </div>
                <div className="text-xs text-slate-500">
                  {o.user.name} ({o.user.email}) • Txn: {o.transactionId}
                </div>
                <button
                  onClick={() => toggleMerchFulfilled(o.id, o.merchFulfilled)}
                  className={`mt-2 rounded px-3 py-1 text-xs font-medium text-white ${
                    o.merchFulfilled ? "bg-emerald-600" : "bg-amber-600"
                  }`}
                >
                  {o.merchFulfilled ? "Fulfilled ✓" : "Mark as Fulfilled"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

