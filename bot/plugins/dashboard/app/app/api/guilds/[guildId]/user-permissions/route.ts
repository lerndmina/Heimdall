/**
 * User permissions API — returns the current user's resolved dashboard permissions.
 *
 * Called by the sidebar and pages to determine what the user can see/do.
 * Also returns the `hideDeniedFeatures` setting.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserGuilds } from "@/lib/guildCache";
import { resolvePermissions, type RoleOverrides, type MemberInfo } from "@/lib/permissions";

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;

interface RouteParams {
  params: Promise<{ guildId: string }>;
}

async function fetchBotApi<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "X-API-Key": API_KEY },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? (json.data as T) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { guildId } = await params;
  const guilds = await getUserGuilds(session.accessToken, session.user.id);
  const hasAccess = guilds.some((g) => g.id === guildId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch member info + permission overrides + settings in parallel
  const [memberData, permData, settingsData] = await Promise.all([
    fetchBotApi<MemberInfo>(`/api/guilds/${guildId}/members/${session.user.id}`),
    fetchBotApi<{ permissions: Array<{ discordRoleId: string; overrides: Record<string, "allow" | "deny"> }> }>(`/api/guilds/${guildId}/dashboard-permissions`),
    fetchBotApi<{ settings: { hideDeniedFeatures: boolean } }>(`/api/guilds/${guildId}/dashboard-settings`),
  ]);

  if (!memberData) {
    // If member not in cache, default to basic access (no special permissions)
    return NextResponse.json({
      success: true,
      data: {
        permissions: {},
        hideDeniedFeatures: false,
        isOwner: false,
        isAdministrator: false,
      },
    });
  }

  // Build role overrides for the user's roles only
  const roleOverrides: RoleOverrides[] = (permData?.permissions ?? []).filter((p) => memberData.roleIds.includes(p.discordRoleId)).map((p) => ({ overrides: p.overrides }));

  const resolved = resolvePermissions(memberData, roleOverrides);

  return NextResponse.json({
    success: true,
    data: {
      permissions: resolved.getAll(),
      hideDeniedFeatures: settingsData?.settings?.hideDeniedFeatures ?? false,
      isOwner: memberData.isOwner,
      isAdministrator: memberData.isAdministrator,
      denyAccess: resolved.denyAccess,
    },
  });
}
