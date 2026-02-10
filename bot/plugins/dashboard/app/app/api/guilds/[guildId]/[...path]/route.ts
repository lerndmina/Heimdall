/**
 * Proxy API route — forwards dashboard requests to the bot API.
 *
 * Path: /api/guilds/[guildId]/[...path]
 * Validates NextAuth session, checks dashboard permissions, then forwards to bot API with X-API-Key.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserGuilds } from "@/lib/guildCache";
import { resolveRouteAction } from "@/lib/routePermissions";
import { resolvePermissions, type RoleOverrides, type MemberInfo } from "@/lib/permissions";
import { checkBotOwner } from "@/lib/botOwner";
import { permissionCategories } from "@/lib/permissionDefs";

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
      cache: "no-store",
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
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { guildId, path: pathSegments } = await params;

  // Verify user has access to this guild via the guild cache
  const guilds = await getUserGuilds(session.accessToken, session.user.id);
  const hasAccess = guilds.some((g) => g.id === guildId);
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

    // Bot owners bypass all permission checks (same as guild owner)
    const isBotOwner = await checkBotOwner(session.user.id);

    // Guild owner or bot owner bypasses all checks
    if (!memberData.isOwner && !isBotOwner) {
      // Fetch guild permission overrides and definitions
      const [permData, permissionDefs] = await Promise.all([
        fetchBotApi<{ permissions: Array<{ discordRoleId: string; overrides: Record<string, "allow" | "deny">; position: number }> }>(
          `/api/guilds/${guildId}/dashboard-permissions`,
          `perms:${guildId}`,
        ),
        fetchBotApi<{ categories: Array<{ key: string; label: string; description: string; actions: Array<{ key: string; label: string; description: string }> }> }>(
          `/api/guilds/${guildId}/permission-defs`,
          `permdefs:${guildId}`,
        ),
      ]);

      // Build role overrides for the user's roles only, including position for hierarchy resolution
      const roleOverrides: RoleOverrides[] = (permData?.permissions ?? [])
        .filter((p) => memberData.roleIds.includes(p.discordRoleId))
        .map((p) => ({ overrides: p.overrides, position: p.position ?? 0 }));

      const resolved = resolvePermissions(memberData, roleOverrides, permissionDefs?.categories ?? permissionCategories);

      // If dashboard access is denied entirely, block all requests
      if (resolved.denyAccess) {
        return NextResponse.json({ error: "Dashboard access denied for your role" }, { status: 403 });
      }

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
      cache: "no-store",
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

// Force dynamic rendering — never cache responses from the bot API
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
