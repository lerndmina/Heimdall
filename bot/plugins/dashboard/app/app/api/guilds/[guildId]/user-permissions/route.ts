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
import { permissionCategories, type PermissionCategory } from "@/lib/permissionDefs";
import { checkBotOwner } from "@/lib/botOwner";

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

  // Fetch member info + permission overrides + settings + bot owner in parallel
  const [memberData, permData, settingsData, permissionDefs, isBotOwner] = await Promise.all([
    fetchBotApi<MemberInfo>(`/api/guilds/${guildId}/members/${session.user.id}`),
    fetchBotApi<{ permissions: Array<{ discordRoleId: string; overrides: Record<string, "allow" | "deny">; position: number }> }>(`/api/guilds/${guildId}/dashboard-permissions`),
    fetchBotApi<{ settings: { hideDeniedFeatures: boolean } }>(`/api/guilds/${guildId}/dashboard-settings`),
    fetchBotApi<{ categories: PermissionCategory[] }>(`/api/guilds/${guildId}/permission-defs`),
    checkBotOwner(session.user.id),
  ]);

  if (!memberData) {
    // If member data cannot be fetched, deny access (unless bot owner)
    if (isBotOwner) {
      // Bot owners still get full access even without member data
      return NextResponse.json({
        success: true,
        data: {
          permissions: {},
          hideDeniedFeatures: false,
          isOwner: false,
          isBotOwner: true,
          isAdministrator: false,
        },
      });
    }
    return NextResponse.json({ error: "Could not verify guild membership" }, { status: 403 });
  }

  // Bot owners bypass all permission checks — treat as guild owner
  const effectiveMember: MemberInfo = isBotOwner ? { ...memberData, isOwner: true } : memberData;

  // Build role overrides for the user's roles only, including position for hierarchy resolution
  const roleOverrides: RoleOverrides[] = (permData?.permissions ?? []).filter((p) => memberData.roleIds.includes(p.discordRoleId)).map((p) => ({ overrides: p.overrides, position: p.position ?? 0 }));

  const resolved = resolvePermissions(effectiveMember, roleOverrides, permissionDefs?.categories ?? permissionCategories);

  return NextResponse.json({
    success: true,
    data: {
      permissions: resolved.getAll(),
      hideDeniedFeatures: settingsData?.settings?.hideDeniedFeatures ?? false,
      isOwner: memberData.isOwner,
      isBotOwner,
      isAdministrator: memberData.isAdministrator,
      denyAccess: resolved.denyAccess,
    },
  });
}
