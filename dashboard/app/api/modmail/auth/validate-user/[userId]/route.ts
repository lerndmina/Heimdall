import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BOT_API_URL = process.env.BOT_API_URL || "http://localhost:3001";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

// Helper to check if we're in development mode
const isDev = process.env.NODE_ENV === "development";
const debugLog = isDev ? console.log : () => {};

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    debugLog("validate-user route: Starting request processing");

    // Get session to ensure user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      debugLog("validate-user route: No session found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    debugLog("validate-user route: Session found for user:", session.user.id);

    // Get userId from params (Next.js 14 requires Promise wrapping)
    const { userId } = await context.params;
    debugLog("validate-user route: Validating user:", userId);

    // Make sure the authenticated user matches the requested userId
    if (session.user.id !== userId) {
      debugLog("validate-user route: User ID mismatch. Session:", session.user.id, "Requested:", userId);
      return NextResponse.json({ error: "Forbidden: Can only validate your own user" }, { status: 403 });
    }

    // Proxy the request to the bot API
    const botApiUrl = `${BOT_API_URL}/api/modmail/auth/validate-user/${userId}`;
    debugLog("validate-user route: Proxying to bot API:", botApiUrl);

    const response = await fetch(botApiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${INTERNAL_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    debugLog("validate-user route: Bot API response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      debugLog("validate-user route: Bot API error:", errorData);

      // Handle rate limiting specifically
      if (response.status === 429) {
        console.warn("validate-user route: Rate limited by bot API");
        return NextResponse.json(
          {
            error: "Too many requests - please wait before trying again",
            retryAfter: response.headers.get("retry-after") || "60",
          },
          {
            status: 429,
            headers: {
              "Retry-After": response.headers.get("retry-after") || "60",
            },
          }
        );
      }

      return NextResponse.json({ error: errorData.message || "Failed to validate user" }, { status: response.status });
    }

    const data = await response.json();
    debugLog("validate-user route: Success, returning data");

    return NextResponse.json(data);
  } catch (error) {
    console.error("validate-user route: Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
