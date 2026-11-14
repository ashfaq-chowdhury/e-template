import { NextResponse } from "next/server";

/**
 * Automated container health probe endpoint hit by Docker HEALTHCHECK
 * (see `Dockerfile` line 61) to verify the Next.js server is accepting HTTP traffic.
 */
export async function GET() {
  return NextResponse.json({ status: "ok", service: "e-template" });
}

