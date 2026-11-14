import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "e-template — Miniature E-Commerce Platform",
  description:
    "Miniature full-stack e-commerce & event ticketing template demonstrating Next.js, Prisma, SSLCommerz, Supabase, RBAC, and Docker.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              e-<span className="text-emerald-600">template</span>
            </Link>
            <div className="flex gap-4 text-sm font-medium">
              <Link href="/" className="hover:text-emerald-600">
                Storefront &amp; Cart
              </Link>
              <Link href="/admin" className="hover:text-emerald-600">
                Admin Dashboard
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

