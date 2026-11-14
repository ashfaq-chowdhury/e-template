import { NextRequest, NextResponse } from "next/server";

/**
 * Layer 1 Security — Edge Middleware
 * Runs on the Edge runtime BEFORE /admin/* pages or routes render.
 * Because Edge runtime cannot open TCP connections to PostgreSQL or run native
 * bcrypt, middleware performs a fast presence check on the JWT (`authToken` cookie
 * or `Authorization: Bearer` header). Layer 2 (`src/lib/auth.ts -> isAdminRequest`)
 * then performs full JWT signature + DB `isAdmin` verification in API routes.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    let token = request.cookies.get("authToken")?.value;

    if (!token) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("authRequired", "admin");
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};

