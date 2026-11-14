# e-template — Miniature Full-Stack E-Commerce Architecture

A compact, heavily commented miniature e-commerce & event ticketing site (**e-template**). Built specifically as an easy-to-study codebase where every full-stack engineering pattern and resume highlight maps cleanly to 1–2 concise files.

---

## Resume-to-Code Map (Study Guide)

| Resume Feature / Skill | Where It Lives | Key Engineering Concepts to Explain |
| :--- | :--- | :--- |
| **Relational Schema & Integrity** | [`prisma/schema.prisma`](prisma/schema.prisma) | 8 PostgreSQL models (`User`, `Product`, `Event`, `TicketType`, `Order`, `OrderItem`, `TicketOrder`, `Payment`). Uses `onDelete: Cascade` for child entities (`Order` → `OrderItem`, `Event` → `TicketType`) and `onDelete: Restrict` to prevent deleting products/ticket tiers with existing customer orders. |
| **Unified Cart → Split Fulfillment** | [`src/app/api/payment/init/route.ts`](src/app/api/payment/init/route.ts) & [`src/app/api/payment/verify/route.ts`](src/app/api/payment/verify/route.ts) | Mixed carts (merch + tickets) are saved as JSON in a staging `Payment` table before redirecting to SSLCommerz. Upon server-to-server validation, the cart splits into `Order` (`-MERCH`) and `TicketOrder` (`-TKT{i}`) records while keeping `@unique` `transactionId` constraints intact and guarding against duplicate webhook calls. |
| **SSLCommerz Gateway & IPN** | [`src/lib/sslcommerz.ts`](src/lib/sslcommerz.ts) & [`src/app/api/payment/ipn/route.ts`](src/app/api/payment/ipn/route.ts) | Posts `application/x-www-form-urlencoded` payloads with JSON/form-encoded fallback parsing, generates `TXN-...` IDs, runs trusted server-to-server `val_id` validation, and handles async IPN webhooks. |
| **JWT + bcrypt + Two-Layer RBAC** | [`src/lib/auth.ts`](src/lib/auth.ts), [`src/middleware.ts`](src/middleware.ts), [`src/app/api/auth/route.ts`](src/app/api/auth/route.ts) | Passwords hashed with salted `bcrypt` (`10` rounds); 7-day JWT set in an HTTP-only `authToken` cookie. **Layer 1:** Next.js Edge Middleware checks token presence on `/admin/*`. **Layer 2:** API routes verify JWT signature AND re-check `user.isAdmin` in PostgreSQL. |
| **Admin Fulfillment Dashboard** | [`src/app/admin/page.tsx`](src/app/admin/page.tsx) & [`src/app/api/admin/orders/route.ts`](src/app/api/admin/orders/route.ts) | Fetches nested `Order` and `TicketOrder` relations (`GET`) and dispatches domain-specific updates (`PATCH`): seat assignments for tickets (`seatNumber`) and fulfillment status for merch (`merchFulfilled`). |
| **Cloud Media Pipeline (Supabase)** | [`src/app/api/upload/route.ts`](src/app/api/upload/route.ts) & [`next.config.ts`](next.config.ts) | Parses multipart `FormData`, validates `image/*` MIME types, streams `ArrayBuffer` to Supabase Storage (`product-images`), and returns the CDN public URL (whitelisted in `next.config.ts` `images.remotePatterns`). |
| **Production Dockerization** | [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml), [`src/app/api/health/route.ts`](src/app/api/health/route.ts) | 3-stage `node:20-alpine` Dockerfile (`deps` → `deps-all` → `builder` → `runner`) using Next.js `output: "standalone"`, least-privilege non-root `nextjs` user, `pg_isready` DB dependency healthcheck, and automated `HEALTHCHECK` polling `/api/health`. |

---

## Local Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Start PostgreSQL with Docker (or point DATABASE_URL to your Postgres instance)
docker compose up -d postgres

# 4. Push Prisma schema and generate client
npx prisma db push

# 5. Start Next.js dev server
npm run dev
```

To test the full production container stack (`postgres` + multi-stage `web`):
```bash
npm run docker:up
```

---

## How to Push `e-template` to Your Own GitHub Repository

This folder is already initialized as its **own independent Git repository** (and excluded from the parent repository via `.git/info/exclude`).

1. Create a new empty repository on GitHub (e.g., `e-template` — do **not** initialize with a README or `.gitignore` on GitHub).
2. Run these commands **inside** the `e-template` folder:

```bash
cd e-template
git branch -M main
git remote add origin https://github.com/ashfaq-chowdhury/e-template.git
git push -u origin main
```

