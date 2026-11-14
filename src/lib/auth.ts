import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface TokenPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
}

// --- Password Hashing (bcrypt) ---

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

// --- JWT Token Helpers ---

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extracts a JWT from either the HTTP-only `authToken` cookie (browser flows)
 * or an `Authorization: Bearer <token>` header (API clients / testing).
 */
export function extractTokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies.get("authToken")?.value;
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Server-side RBAC guard for Admin API routes.
 * Edge Middleware only checks token presence (fast); API routes must verify
 * the JWT signature AND re-check `isAdmin` in PostgreSQL in case privileges changed.
 */
export async function isAdminRequest(request: NextRequest): Promise<{
  isAuthorized: boolean;
  userId?: string;
  error?: string;
  status: number;
}> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return { isAuthorized: false, error: "Authentication required", status: 401 };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return { isAuthorized: false, error: "Invalid or expired token", status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, isAdmin: true },
  });

  if (!user) {
    return { isAuthorized: false, error: "User not found", status: 404 };
  }

  if (!user.isAdmin) {
    return { isAuthorized: false, error: "Admin access required", status: 403 };
  }

  return { isAuthorized: true, userId: user.id, status: 200 };
}

