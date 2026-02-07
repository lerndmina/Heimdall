/**
 * Proxy API route — forwards dashboard requests to the bot API.
 *
 * Path: /api/guilds/[guildId]/[...path]
 * Validates NextAuth session, then forwards to bot API with X-API-Key.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;

interface RouteParams {
  params: Promise<{
    guildId: string;
    path: string[];
  }>;
}

async function proxyRequest(req: NextRequest, { params }: RouteParams) {
  // Check auth
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { guildId, path: pathSegments } = await params;

  // Verify user has access to this guild
  const hasAccess = session.guilds?.some((g) => g.id === guildId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build target URL
  const targetPath = pathSegments.join("/");
  const url = new URL(`/api/guilds/${guildId}/${targetPath}`, API_BASE);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Forward request to bot API
  try {
    const headers: Record<string, string> = {
      "X-API-Key": API_KEY,
      "Content-Type": req.headers.get("content-type") || "application/json",
    };

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    // Forward body for non-GET requests
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.text();
    }

    const res = await fetch(url.toString(), init);
    const data = await res.text();

    return new NextResponse(data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[Dashboard Proxy] Failed to forward request:", error);
    return NextResponse.json({ error: "Failed to connect to bot API" }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
