/**
 * Next.js middleware — protects dashboard routes, redirects unauthenticated users.
 */
export { auth as middleware } from "@/lib/auth";

export const config = {
  // Protect all dashboard routes, but exclude API routes, login, and static assets
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
