import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BOT_API_URL = process.env.BOT_API_URL || "http://localhost:3001";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

// Helper to check if we're in development mode
const isDev = process.env.NODE_ENV === "development";
const debugLog = isDev ? console.log : () => {};

export async function GET(request: NextRequest, context: { params: Promise<{ guildId: string; threadId: string }> }) {
  try {
    debugLog("transcript route: Starting request processing");

    // Get session to ensure user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      debugLog("transcript route: No session found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    debugLog("transcript route: Session found for user:", session.user.id);

    // Get parameters
    const { guildId, threadId } = await context.params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "html";

    debugLog("transcript route: Processing transcript request", { guildId, threadId, format });

    // First, get the thread to check permissions
    const threadResponse = await fetch(`${BOT_API_URL}/api/modmail/${guildId}/threads/${threadId}?includeMessages=false`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${INTERNAL_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!threadResponse.ok) {
      debugLog("transcript route: Failed to fetch thread for permission check");
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const threadData = await threadResponse.json();
    const thread = threadData?.data;

    if (!thread) {
      debugLog("transcript route: Thread data not found");
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    debugLog("transcript route: Thread found, checking permissions", {
      userId: session.user.id,
      threadUserId: thread.userId,
    });

    // Check if user is the ticket owner
    if (thread.userId === session.user.id) {
      debugLog("transcript route: User is ticket owner - access granted");
    } else {
      // Check if user has staff role in this guild
      debugLog("transcript route: User is not ticket owner, checking staff permissions");

      const userValidationResponse = await fetch(`${BOT_API_URL}/api/modmail/auth/validate-user/${session.user.id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${INTERNAL_API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!userValidationResponse.ok) {
        debugLog("transcript route: Failed to validate user permissions");

        // Handle rate limiting gracefully
        if (userValidationResponse.status === 429) {
          console.warn("transcript route: Rate limited by bot API");
          return NextResponse.json(
            {
              error: "Too many requests - please wait before trying again",
              retryAfter: userValidationResponse.headers.get("retry-after") || "60",
            },
            {
              status: 429,
              headers: {
                "Retry-After": userValidationResponse.headers.get("retry-after") || "60",
              },
            }
          );
        }

        return NextResponse.json({ error: "Failed to validate permissions" }, { status: 403 });
      }

      const userValidation = await userValidationResponse.json();
      const guilds = userValidation?.data?.guilds || [];
      const hasStaffRole = guilds.some((guild: any) => guild.guildId === guildId && guild.hasStaffRole);

      if (!hasStaffRole) {
        debugLog("transcript route: User does not have staff role - access denied");
        return NextResponse.json(
          {
            error: "Forbidden: You can only view transcripts for your own tickets or if you have staff permissions",
          },
          { status: 403 }
        );
      }

      debugLog("transcript route: User has staff role - access granted");
    }

    // User has permission, generate the transcript
    debugLog("transcript route: Generating transcript");

    const transcriptResponse = await fetch(`${BOT_API_URL}/api/modmail/${guildId}/threads/${threadId}/transcript?format=${format}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${INTERNAL_API_KEY}`,
        ...(format === "json" ? { "Content-Type": "application/json" } : {}),
      },
    });

    debugLog("transcript route: Bot API response status:", transcriptResponse.status);

    if (!transcriptResponse.ok) {
      const errorData = await transcriptResponse.json().catch(() => ({}));
      debugLog("transcript route: Bot API error:", errorData);

      // Handle rate limiting from bot API
      if (transcriptResponse.status === 429) {
        console.warn("transcript route: Rate limited by bot API on transcript generation");
        return NextResponse.json(
          {
            error: "Too many requests - please wait before trying again",
            retryAfter: transcriptResponse.headers.get("retry-after") || "60",
          },
          {
            status: 429,
            headers: {
              "Retry-After": transcriptResponse.headers.get("retry-after") || "60",
            },
          }
        );
      }

      return NextResponse.json(
        {
          error: errorData.message || "Failed to generate transcript",
        },
        { status: transcriptResponse.status }
      );
    }

    // Return the transcript with proper content type
    if (format === "json") {
      const data = await transcriptResponse.json();
      debugLog("transcript route: Returning JSON transcript");
      return NextResponse.json(data);
    } else {
      const html = await transcriptResponse.text();
      debugLog("transcript route: Returning HTML transcript");
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    }
  } catch (error) {
    console.error("transcript route: Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
