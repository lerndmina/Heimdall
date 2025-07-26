import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db-health";

export async function GET() {
  const botApiUrl = process.env.BOT_API_URL;
  const internalApiKey = process.env.INTERNAL_API_KEY;

  // Check database connectivity (optional since we use JWT sessions)
  let databaseStatus = "not-required";
  let databaseError: string | undefined;

  if (process.env.DATABASE_URL) {
    const { connected: databaseConnected, error } = await checkDatabaseHealth();
    databaseStatus = databaseConnected ? "connected" : "disconnected";
    databaseError = error;
  }

  // Check environment variables
  if (!botApiUrl || !internalApiKey) {
    return NextResponse.json(
      {
        status: "error",
        message: "Missing bot API configuration",
        timestamp: new Date().toISOString(),
        database: { status: databaseStatus, error: databaseError },
        environment: {
          BOT_API_URL: botApiUrl ? "configured" : "missing",
          INTERNAL_API_KEY: internalApiKey ? "configured" : "missing",
          DATABASE_URL: process.env.DATABASE_URL ? "configured" : "missing",
        },
      },
      { status: 500 }
    );
  }

  // Try to connect to bot API
  try {
    const response = await fetch(`${botApiUrl}/api/health`, {
      headers: {
        Authorization: `Bearer ${internalApiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const botHealth = await response.json();
      return NextResponse.json({
        status: "healthy", // Dashboard is healthy since we don't depend on database
        timestamp: new Date().toISOString(),
        dashboard: "operational",
        database: { status: databaseStatus, error: databaseError },
        botApi: botHealth,
        environment: {
          BOT_API_URL: new URL(botApiUrl).origin, // Only show origin for security
          NODE_ENV: process.env.NODE_ENV,
        },
      });
    } else {
      return NextResponse.json(
        {
          status: "degraded",
          message: `Bot API returned ${response.status}`,
          timestamp: new Date().toISOString(),
          dashboard: "operational",
          database: { status: databaseStatus, error: databaseError },
          botApi: "unreachable",
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        message: "Cannot connect to bot API",
        timestamp: new Date().toISOString(),
        dashboard: "operational",
        database: { status: databaseStatus, error: databaseError },
        botApi: "unreachable",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
