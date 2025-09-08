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
  return handleModmailRequest(request, params.path, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return handleModmailRequest(request, params.path, "POST");
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return handleModmailRequest(request, params.path, "PUT");
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return handleModmailRequest(request, params.path, "DELETE");
}

async function handleModmailRequest(request: NextRequest, pathSegments: string[], method: string) {
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
    const [firstSegment, ...restSegments] = pathSegments;
    debugLog(`Request path segments:`, { firstSegment, restSegments, pathSegments });

    // 3. Authorization Logic
    if (firstSegment === "auth" && restSegments[0] === "validate-user") {
      // Allow users to validate themselves, staff to validate anyone
      const targetUserId = restSegments[1];
      debugLog(`Auth validation request: user ${userId} validating ${targetUserId}`);
      if (targetUserId !== userId) {
        // This is staff trying to validate someone else, check their permissions via bot API
        debugLog(`Staff validation required for user ${userId}`);
        const isStaff = await validateStaffAccess(userId);
        if (!isStaff) {
          return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }
      }
    } else if (firstSegment === "user") {
      // User-specific endpoints: /api/modmail/user/{userId}/tickets
      const targetUserId = restSegments[0];
      debugLog(`User data request: user ${userId} accessing ${targetUserId}`);
      if (targetUserId !== userId) {
        // Staff trying to access another user's tickets - verify they have staff access
        const isStaff = await validateStaffAccess(userId);
        if (!isStaff) {
          return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }
      }
    } else {
      // Guild-specific endpoints: /api/modmail/{guildId}/*
      // Let the bot API handle all guild-specific authorization
      debugLog(`🔍 Guild data request: user ${userId} accessing path ${pathSegments.join("/")}`);
      // The bot API has proper middleware that will check permissions
    }

    // 4. Make the request to bot API
    const botApiPath = `/api/modmail/${pathSegments.join("/")}`;
    const searchParams = request.nextUrl.searchParams.toString();
    const botApiUrl = `${BOT_API_URL}${botApiPath}${searchParams ? `?${searchParams}` : ""}`;

    const headers: HeadersInit = {
      Authorization: `Bearer ${INTERNAL_API_KEY}`,
      "Content-Type": "application/json",
      "X-User-ID": userId, // Pass user ID to bot API for logging/tracking
    };

    const requestOptions: RequestInit = {
      method,
      headers,
    };

    // Include body for POST, PUT requests
    if (method === "POST" || method === "PUT") {
      const body = await request.text();
      if (body) {
        requestOptions.body = body;
      }
    }

    // Make request to bot API
    const response = await fetch(botApiUrl, requestOptions);

    // Get response data
    const responseData = await response.text();

    // Try to parse as JSON, fallback to text
    let parsedData;
    try {
      parsedData = JSON.parse(responseData);
    } catch {
      parsedData = responseData;
    }

    // Return response with same status code
    if (response.ok) {
      return NextResponse.json(parsedData, { status: response.status });
    } else {
      return NextResponse.json(parsedData || { error: `Bot API returned ${response.status}` }, { status: response.status });
    }
  } catch (error) {
    console.error("Error handling modmail request:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

// Helper function to validate if user has staff access in any guild
async function validateStaffAccess(userId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BOT_API_URL}/api/modmail/auth/validate-user/${userId}`, {
      headers: {
        Authorization: `Bearer ${INTERNAL_API_KEY}`,
      },
    });

    if (response.ok) {
      const response_data = await response.json();
      debugLog(`Staff validation for user ${userId}:`, JSON.stringify(response_data, null, 2));
      // Check if user has staff access in any guild - extract from nested data structure
      const hasAccess = response_data.data?.hasAccess;
      const guilds = response_data.data?.guilds;
      return hasAccess || (guilds && guilds.some((guild: any) => guild.hasStaffRole));
    }
    return false;
  } catch (error) {
    console.error("Error validating staff access:", error);
    return false;
  }
}

// Helper function to validate if user has access to specific guild
async function validateGuildAccess(userId: string, guildId: string): Promise<boolean> {
  try {
    debugLog(`🔍 Validating guild access for user ${userId} in guild ${guildId}`);

    const response = await fetch(`${BOT_API_URL}/api/modmail/auth/validate-user/${userId}`, {
      headers: {
        Authorization: `Bearer ${INTERNAL_API_KEY}`,
      },
    });

    debugLog(`🔍 Bot API response status: ${response.status}`);

    if (response.ok) {
      const response_data = await response.json();
      debugLog(`🔍 Bot API response for user ${userId}:`, JSON.stringify(response_data, null, 2));

      // Extract guilds from the nested data structure
      const guilds = response_data.data?.guilds;
      if (!guilds || !Array.isArray(guilds)) {
        debugLog(`❌ No guilds array found in response.data`);
        return false;
      }

      debugLog(`🔍 Found ${guilds.length} guilds for user ${userId}`);

      const hasAccess = guilds.some((guild: any) => {
        debugLog(`🔍 Checking guild: "${guild.guildId}" === "${guildId}" ? ${guild.guildId === guildId}`);
        debugLog(`🔍 Guild data:`, JSON.stringify(guild, null, 2));
        debugLog(`🔍 Guild has staff role: ${guild.hasStaffRole}`);

        const guildMatches = guild.guildId === guildId;
        const hasStaffRole = guild.hasStaffRole;
        const result = guildMatches && hasStaffRole;

        debugLog(`🔍 Final check for guild ${guild.guildId}: match=${guildMatches}, staff=${hasStaffRole}, result=${result}`);

        return result;
      });

      debugLog(`🔍 Final guild access result for ${guildId}: ${hasAccess}`);
      return hasAccess;
    } else {
      console.error(`❌ Bot API returned ${response.status} for user validation`);
      const errorText = await response.text().catch(() => "Unable to read error");
      console.error(`❌ Bot API error response:`, errorText);
      return false;
    }
  } catch (error) {
    console.error("❌ Error validating guild access:", error);
    return false;
  }
}
