import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BOT_API_URL = process.env.BOT_API_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

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
    console.log(`Request path segments:`, { firstSegment, restSegments, pathSegments });

    // 3. Authorization Logic
    if (firstSegment === "auth" && restSegments[0] === "validate-user") {
      // Allow users to validate themselves, staff to validate anyone
      const targetUserId = restSegments[1];
      console.log(`Auth validation request: user ${userId} validating ${targetUserId}`);
      if (targetUserId !== userId) {
        // This is staff trying to validate someone else, check their permissions via bot API
        console.log(`Staff validation required for user ${userId}`);
        const isStaff = await validateStaffAccess(userId);
        if (!isStaff) {
          return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }
      }
    } else if (firstSegment === "user") {
      // User-specific endpoints: /api/modmail/user/{userId}/tickets
      const targetUserId = restSegments[0];
      console.log(`User data request: user ${userId} accessing ${targetUserId}`);
      if (targetUserId !== userId) {
        // Staff trying to access another user's tickets - verify they have staff access
        const isStaff = await validateStaffAccess(userId);
        if (!isStaff) {
          return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }
      }
    } else {
      // Guild-specific endpoints: /api/modmail/{guildId}/*
      const guildId = firstSegment;
      console.log(`Guild data request: user ${userId} accessing guild ${guildId}`);
      if (guildId) {
        // Check if user has staff access to this guild
        const hasAccess = await validateGuildAccess(userId, guildId);
        console.log(`Guild access result: ${hasAccess}`);
        if (!hasAccess) {
          return NextResponse.json({ error: "Insufficient permissions for this guild" }, { status: 403 });
        }
      }
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
      const data = await response.json();
      console.log(`Staff validation for user ${userId}:`, JSON.stringify(data, null, 2));
      // Check if user has staff access in any guild
      return data.hasAccess || (data.guilds && data.guilds.some((guild: any) => guild.hasStaffRole));
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
    console.log(`Validating guild access for user ${userId} in guild ${guildId}`);

    const response = await fetch(`${BOT_API_URL}/api/modmail/auth/validate-user/${userId}`, {
      headers: {
        Authorization: `Bearer ${INTERNAL_API_KEY}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`Bot API response for user ${userId}:`, JSON.stringify(data, null, 2));

      const hasAccess =
        data.guilds &&
        data.guilds.some((guild: any) => {
          console.log(`Checking guild: ${guild.guildId} === ${guildId} ?`, guild.guildId === guildId);
          console.log(`Guild has staff role: ${guild.hasStaffRole}`);
          return guild.guildId === guildId && guild.hasStaffRole;
        });

      console.log(`Guild access result for ${guildId}: ${hasAccess}`);
      return hasAccess;
    } else {
      console.error(`Bot API returned ${response.status} for user validation`);
      return false;
    }
  } catch (error) {
    console.error("Error validating guild access:", error);
    return false;
  }
}
