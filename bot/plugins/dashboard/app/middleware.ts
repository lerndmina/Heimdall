/**
 * Next.js middleware — protects dashboard routes, adds performance headers.
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIntegrationPluginFromSegment, isPluginEnabled, parseEnabledPlugins } from "@/lib/integrations";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const guildId = segments[0];
    const integrationPlugin = getIntegrationPluginFromSegment(segments[1]);
    const enabledPlugins = parseEnabledPlugins(process.env.DASHBOARD_ENABLED_PLUGINS);
    if (!isPluginEnabled(enabledPlugins, integrationPlugin)) {
      return NextResponse.redirect(new URL(`/${guildId}`, request.url));
    }
  }

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
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https://cdn.discordapp.com https://mc-heads.net https://r2-bifrost.lerndmina.dev data:",
      "font-src 'self'",
      `connect-src 'self' ${process.env.WEBSOCKET_URL ? process.env.WEBSOCKET_URL : ""}`.trim(),
      "frame-ancestors 'none'",
    ].join("; "),
  );

  return response;
}

export const config = {
  // Protect all routes including API routes, but exclude static assets, Next.js internals,
  // login, and dev pages. API auth endpoints are allowed through by the authorized() callback.
  matcher: ["/((?!_next/static|_next/image|login|dev|favicon.ico).*)"],
};
