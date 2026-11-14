import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractTokenFromRequest,
  generateToken,
  hashPassword,
  verifyPassword,
  verifyToken,
} from "@/lib/auth";

/**
 * GET /api/auth — Returns the currently authenticated user's profile from JWT.
 */
export async function GET(request: NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, name: true, phone: true, isAdmin: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

/**
 * POST /api/auth — Handles both signup and login via `{ action: "signup" | "login" }`.
 * Hashes passwords with bcrypt, issues a 7-day JWT, and sets an HTTP-only cookie
 * so Edge Middleware can gate `/admin/*` navigation automatically.
 */
export async function POST(request: NextRequest) {
  try {
    const { action, email, password, name, phone } = await request.json();

    if (!email || !password || !["signup", "login"].includes(action)) {
      return NextResponse.json(
        { error: "Provide action ('signup' or 'login'), email, and password" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    let user;

    if (action === "signup") {
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }

      const hashedPassword = await hashPassword(password);
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: name || normalizedEmail.split("@")[0],
          phone: phone || null,
          isAdmin: false,
        },
      });
    } else {
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user || !(await verifyPassword(password, user.password))) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
    });

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.isAdmin,
        },
        token,
      },
      { status: action === "signup" ? 201 : 200 }
    );

    // Cookie is read by Edge Middleware (`src/middleware.ts`) and API RBAC guards
    response.cookies.set("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Auth] Error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

