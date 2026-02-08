/**
 * Next.js middleware — protects dashboard routes, adds performance headers.
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Apply auth middleware
  const authResult = await auth(request as any);

  // If auth redirects or blocks, return that
  if (authResult instanceof Response) {
    return authResult;
  }

  // Create response with headers
  const response = NextResponse.next();

  // Cache static assets aggressively
  if (request.nextUrl.pathname.startsWith("/_next/static/")) {
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  // Cache images
  else if (request.nextUrl.pathname.startsWith("/_next/image")) {
    response.headers.set("Cache-Control", "public, max-age=2592000, stale-while-revalidate=86400");
  }
  // API routes - no cache but allow revalidation
  else if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-cache, must-revalidate");
  }
  // Dynamic pages - cache for 1 minute, revalidate in background
  else {
    response.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  }

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  // Protect all dashboard routes, but exclude login, dev pages, static assets, and Next.js internals
  matcher: ["/((?!api|_next/static|_next/image|login|dev|favicon.ico).*)"],
};
