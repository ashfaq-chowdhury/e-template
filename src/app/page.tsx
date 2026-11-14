"use client";

import { useState } from "react";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  isTicket: boolean;
  productId?: string;
  eventId?: string;
  ticketTypeId?: string;
}

// Sample catalog items representing the two domain entities:
// 1. Physical Merchandise (creates Order + OrderItem)
// 2. Event Ticket Tier (creates TicketOrder)
const DEMO_CATALOG: Omit<CartItem, "quantity">[] = [
  {
    id: "prod-hoodie",
    productId: "prod-hoodie",
    name: "e-template Classic Hoodie",
    price: 2400,
    isTicket: false,
  },
  {
    id: "tkt-vip-pass",
    name: "e-template Launch Event — VIP Pass",
    price: 1500,
    isTicket: true,
    eventId: "evt-launch",
    ticketTypeId: "tt-vip",
  },
];

export default function StorefrontPage() {
  // Auth state
  const [email, setEmail] = useState("demo@etemplate.com");
  const [password, setPassword] = useState("password123");
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);

  // Unified Cart state (can hold BOTH merch and tickets at once)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [valIdInput, setValIdInput] = useState("");
  const [tranId, setTranId] = useState("");
  const [statusLog, setStatusLog] = useState<string>("");

  const addToCart = (item: Omit<CartItem, "quantity">) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Calls POST /api/auth (bcrypt + JWT + HTTP-only authToken cookie)
  const handleAuth = async (action: "login" | "signup") => {
    setStatusLog(`Running ${action}...`);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, email, password, name: "Demo User" }),
    });
    const data = await res.json();
    if (res.ok) {
      setUser(data.user);
      setStatusLog(`Authenticated as ${data.user.email} (JWT cookie set).`);
    } else {
      setStatusLog(`Auth error: ${data.error}`);
    }
  };

  // Step 1 of checkout: stage Payment in PostgreSQL & request SSLCommerz redirect URL
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setStatusLog("Initializing SSLCommerz payment session...");
    const res = await fetch("/api/payment/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart,
        totalAmount,
        userId: user?.id || "guest",
        userEmail: user?.email || email,
        userName: user?.name || "Demo Customer",
        userPhone: "01700000000",
      }),
    });
    const data = await res.json();
    if (res.ok && data.redirectUrl) {
      setTranId(data.transactionId);
      setStatusLog(`Payment staged (${data.transactionId}). Redirecting to SSLCommerz...`);
      window.location.href = data.redirectUrl;
    } else {
      setStatusLog(`Checkout init response: ${JSON.stringify(data)}`);
    }
  };

  // Step 2 of checkout: trigger server-to-server validation & split domain order creation
  const handleVerifyPayment = async () => {
    if (!valIdInput) return;
    setStatusLog("Validating payment with SSLCommerz & splitting orders...");
    const res = await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ val_id: valIdInput, tran_id: tranId }),
    });
    const data = await res.json();
    setStatusLog(`Verify result: ${JSON.stringify(data, null, 2)}`);
    if (res.ok) setCart([]);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Unified Storefront &amp; Checkout Flow</h1>
        <p className="mt-1 text-sm text-slate-600">
          Demonstrates JWT + bcrypt auth, mixed merch + ticket cart staging, and
          SSLCommerz server-to-server verification.
        </p>

        {/* Auth Box */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-4">
          <input
            className="rounded border px-3 py-1.5 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <input
            className="rounded border px-3 py-1.5 text-sm"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <button
            onClick={() => handleAuth("signup")}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Sign Up
          </button>
          <button
            onClick={() => handleAuth("login")}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Log In
          </button>
          {user && (
            <span className="text-xs font-semibold text-emerald-700">
              Logged in: {user.email}
            </span>
          )}
        </div>
      </section>

      {/* Catalog & Unified Cart */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">1. Catalog (Merch + Event Tickets)</h2>
          <div className="mt-4 space-y-3">
            {DEMO_CATALOG.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-slate-500">
                    Type: {item.isTicket ? "Event Ticket" : "Physical Merch"} • BDT{" "}
                    {item.price}
                  </div>
                </div>
                <button
                  onClick={() => addToCart(item)}
                  className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">2. Unified Cart ({cart.length})</h2>
          {cart.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Add both a hoodie and a VIP pass to test split order fulfillment.
            </p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {cart.map((item) => (
                <li key={item.id} className="flex justify-between">
                  <span>
                    {item.name} × {item.quantity}{" "}
                    <span className="text-xs text-slate-400">
                      ({item.isTicket ? "TicketOrder" : "Order"})
                    </span>
                  </span>
                  <span className="font-medium">BDT {item.price * item.quantity}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t pt-4">
            <div className="flex items-center justify-between font-semibold">
              <span>Total</span>
              <span>BDT {totalAmount}</span>
            </div>
            <button
              disabled={cart.length === 0}
              onClick={handleCheckout}
              className="mt-3 w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              Proceed to SSLCommerz Checkout
            </button>
          </div>
        </section>
      </div>

      {/* Payment Verification Tester */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">3. Payment Verification &amp; Order Split</h2>
        <p className="mt-1 text-xs text-slate-500">
          After SSLCommerz redirects back with <code>val_id</code> and{" "}
          <code>tran_id</code>, verify server-to-server to split the cart into{" "}
          <code>Order</code> and <code>TicketOrder</code> rows.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            className="rounded border px-3 py-1.5 text-sm"
            placeholder="tran_id (e.g. TXN-...)"
            value={tranId}
            onChange={(e) => setTranId(e.target.value)}
          />
          <input
            className="rounded border px-3 py-1.5 text-sm"
            placeholder="val_id from SSLCommerz"
            value={valIdInput}
            onChange={(e) => setValIdInput(e.target.value)}
          />
          <button
            onClick={handleVerifyPayment}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Verify &amp; Create Split Orders
          </button>
        </div>

        {statusLog && (
          <pre className="mt-4 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-emerald-300">
            {statusLog}
          </pre>
        )}
      </section>
    </div>
  );
}

