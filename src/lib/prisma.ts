import { PrismaClient } from "@prisma/client";

/**
 * Next.js hot-reloading in development re-evaluates module files on every edit.
 * Caching the PrismaClient instance on `globalThis` prevents exhausting PostgreSQL
 * connection limits across reloads, while production uses a single module instance.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

