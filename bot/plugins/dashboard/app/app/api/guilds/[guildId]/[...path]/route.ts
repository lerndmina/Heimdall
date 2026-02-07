/**
 * Proxy API route — forwards dashboard requests to the bot API.
 *
 * Path: /api/guilds/[guildId]/[...path]
 * Validates NextAuth session, checks dashboard permissions, then forwards to bot API with X-API-Key.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveRouteAction } from "@/lib/routePermissions";
import { resolvePermissions, type RoleOverrides, type MemberInfo } from "@/lib/permissions";

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;

/** Simple in-memory cache with TTL */
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 30_000; // 30 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/** Fetch from bot API with caching */
async function fetchBotApi<T>(path: string, cacheKey?: string): Promise<T | null> {
  if (cacheKey) {
    const cached = getCached<T>(cacheKey);
    if (cached) return cached;
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "X-API-Key": API_KEY },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success) return null;
    if (cacheKey) setCache(cacheKey, json.data);
    return json.data as T;
  } catch {
    return null;
  }
}

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

  // ── Permission gate ──────────────────────────────────────────
  const requiredAction = resolveRouteAction(req.method, pathSegments);

  if (requiredAction) {
    // Fetch member info (roles, isOwner, isAdmin)
    const memberData = await fetchBotApi<MemberInfo>(`/api/guilds/${guildId}/members/${session.user.id}`, `member:${guildId}:${session.user.id}`);

    if (!memberData) {
      return NextResponse.json({ error: "Could not verify member permissions" }, { status: 403 });
    }

    // Guild owner bypasses all checks
    if (!memberData.isOwner) {
      // Fetch guild permission overrides
      const permData = await fetchBotApi<{ permissions: Array<{ discordRoleId: string; overrides: Record<string, "allow" | "deny"> }> }>(
        `/api/guilds/${guildId}/dashboard-permissions`,
        `perms:${guildId}`,
      );

      // Build role overrides for the user's roles only
      const roleOverrides: RoleOverrides[] = (permData?.permissions ?? []).filter((p) => memberData.roleIds.includes(p.discordRoleId)).map((p) => ({ overrides: p.overrides }));

      const resolved = resolvePermissions(memberData, roleOverrides);

      if (!resolved.has(requiredAction)) {
        return NextResponse.json({ error: "You do not have permission to perform this action", requiredAction }, { status: 403 });
      }
    }
  }

  // ── Forward request to bot API ───────────────────────────────
  const targetPath = pathSegments.join("/");
  const url = new URL(`/api/guilds/${guildId}/${targetPath}`, API_BASE);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

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
