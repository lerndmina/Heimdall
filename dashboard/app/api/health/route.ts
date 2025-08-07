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

  // Dashboard is always healthy if it can respond
  // Bot API connectivity is informational only, not a health requirement
  let botApiStatus = "unknown";
  let botApiData: any = null;

  if (botApiUrl && internalApiKey) {
    try {
      const response = await fetch(`${botApiUrl}/api/health`, {
        headers: {
          Authorization: `Bearer ${internalApiKey}`,
        },
        signal: AbortSignal.timeout(3000), // Shorter timeout for optional check
      });

      if (response.ok) {
        botApiStatus = "healthy";
        botApiData = await response.json();
      } else {
        botApiStatus = "unhealthy";
      }
    } catch (error) {
      botApiStatus = "unreachable";
    }
  } else {
    botApiStatus = "not-configured";
  }

  // Always return healthy if dashboard itself is running
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    dashboard: "operational",
    database: { status: databaseStatus, error: databaseError },
    botApi: {
      status: botApiStatus,
      data: botApiData,
    },
    environment: {
      BOT_API_URL: botApiUrl ? "configured" : "missing",
      INTERNAL_API_KEY: internalApiKey ? "configured" : "missing",
      DATABASE_URL: process.env.DATABASE_URL ? "configured" : "missing",
      NODE_ENV: process.env.NODE_ENV,
    },
  });
}
