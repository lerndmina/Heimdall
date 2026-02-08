/**
 * Guild status API route — checks if the bot is in a guild.
 * Proxies to the bot API's /api/guilds/:guildId/status endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserGuilds } from "@/lib/guildCache";

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;

interface RouteParams {
  params: Promise<{ guildId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { guildId } = await params;

  // Verify user has access to this guild via the guild cache
  const guilds = await getUserGuilds(session.accessToken, session.user.id);
  const hasAccess = guilds.some((g) => g.id === guildId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const res = await fetch(`${API_BASE}/api/guilds/${guildId}/status`, {
      headers: { "X-API-Key": API_KEY },
      cache: "no-store",
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to connect to bot API" }, { status: 502 });
  }
}
