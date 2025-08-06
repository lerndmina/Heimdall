import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BOT_API_URL = process.env.BOT_API_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Helper to check if we're in development mode
const isDev = process.env.NODE_ENV === "development";
const debugLog = isDev ? console.log : () => {};

// Fix TypeScript error: Use proper Next.js 14 route parameter type
type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return handleMinecraftRequest(request, params.path, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return handleMinecraftRequest(request, params.path, "POST");
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return handleMinecraftRequest(request, params.path, "PUT");
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return handleMinecraftRequest(request, params.path, "DELETE");
}

async function handleMinecraftRequest(request: NextRequest, pathSegments: string[], method: string) {
  try {
    if (!BOT_API_URL || !INTERNAL_API_KEY) {
      return NextResponse.json({ error: "Bot API configuration missing" }, { status: 500 });
    }

    // 1. Authentication Check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse the request path to determine what they're accessing
    if (pathSegments.length === 0) {
      return NextResponse.json({ error: "Invalid minecraft API path" }, { status: 400 });
    }

    const [guildId, ...restPath] = pathSegments;

    // 3. Validate user access to this guild (check if they have staff role)
    debugLog(`[Minecraft API] Validating ${userId} access to guild ${guildId}`);

    try {
      const validateResponse = await fetch(`${BOT_API_URL}/api/modmail/auth/validate-user/${userId}?guild=${guildId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${INTERNAL_API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!validateResponse.ok) {
        debugLog(`[Minecraft API] Guild validation failed: ${validateResponse.status}`);
        return NextResponse.json({ error: "Unable to validate guild access" }, { status: validateResponse.status });
      }

      const validationData = await validateResponse.json();

      // Check if user has access to this guild
      const hasAccess = validationData.data?.guilds?.some((guild: any) => guild.guildId === guildId);
      if (!hasAccess) {
        debugLog(`[Minecraft API] User ${userId} denied access to guild ${guildId}`);
        return NextResponse.json({ error: "You don't have permission to access minecraft data for this guild" }, { status: 403 });
      }

      debugLog(`[Minecraft API] User ${userId} has access to guild ${guildId}`);
    } catch (error) {
      console.error("[Minecraft API] Validation error:", error);
      return NextResponse.json({ error: "Unable to validate permissions" }, { status: 500 });
    }

    // 4. Forward the request to the bot API
    const apiPath = restPath.length > 0 ? restPath.join("/") : "";
    const botApiUrl = `${BOT_API_URL}/api/minecraft/${guildId}${apiPath ? "/" + apiPath : ""}`;

    debugLog(`[Minecraft API] Forwarding ${method} request to: ${botApiUrl}`);

    let body = undefined;
    if (method !== "GET" && method !== "DELETE") {
      body = JSON.stringify(await request.json());
    }

    // Forward query parameters
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const botApiUrlWithParams = `${botApiUrl}${searchParams.toString() ? "?" + searchParams.toString() : ""}`;

    const botResponse = await fetch(botApiUrlWithParams, {
      method,
      headers: {
        Authorization: `Bearer ${INTERNAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body,
    });

    const botData = await botResponse.json();

    debugLog(`[Minecraft API] Bot API response: ${botResponse.status}`);

    return NextResponse.json(botData, {
      status: botResponse.status,
      headers: {
        // Forward relevant headers
        "Cache-Control": botResponse.headers.get("Cache-Control") || "no-cache",
      },
    });
  } catch (error) {
    console.error("[Minecraft API] Request handling error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
