/**
 * Bot owner check proxy — checks if the current user is a bot owner.
 * Forwards to bot API GET /api/bot-owner with the user's ID.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_BASE}/api/bot-owner`, {
      method: "GET",
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
        "X-User-Id": session.user.id,
      },
      cache: "no-store",
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ success: false, error: { code: "API_ERROR", message: "Failed to connect to bot API" } }, { status: 502 });
  }
}
