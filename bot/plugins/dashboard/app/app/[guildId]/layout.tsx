/**
 * Guild dashboard layout — sidebar + content area.
 * Server component that fetches session, resolves guild info,
 * checks the bot is in the guild, and wraps children in GuildProvider.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserGuilds } from "@/lib/guildCache";
import GuildLayoutShell from "./GuildLayoutShell";

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;

/** Discord admin permission flag (0x8) */
const ADMIN_PERMISSION = "8";

/**
 * Build a Discord OAuth invite URL scoped to a specific guild.
 */
function buildInviteUrl(guildId: string): string {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    permissions: ADMIN_PERMISSION,
    scope: "bot applications.commands",
    guild_id: guildId,
    disable_guild_select: "true",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

interface GuildLayoutProps {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}

export default async function GuildLayout({ children, params }: GuildLayoutProps) {
  const session = await auth();
  if (!session?.user || !session.accessToken) redirect("/login");

  const { guildId } = await params;

  // Fetch the user's guilds from the cache (or Discord API)
  const guilds = await getUserGuilds(session.accessToken, session.user.id);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) {
    redirect("/");
  }

  // Check if the bot is actually in this guild
  let botInGuild = true; // default to true if API is unreachable
  try {
    const res = await fetch(`${API_BASE}/api/guilds/${guildId}/status`, {
      headers: { "X-API-Key": API_KEY },
      cache: "no-store",
    });

    if (res.ok) {
      const body = await res.json();
      botInGuild = !!body.data?.botInGuild;
    }
  } catch {
    // Bot API down — assume bot is in guild so user can see the dashboard
    // (individual features will show errors if the API is actually down)
  }

  if (!botInGuild) {
    redirect(buildInviteUrl(guildId));
  }

  return <GuildLayoutShell guild={{ id: guild.id, name: guild.name, icon: guild.icon }}>{children}</GuildLayoutShell>;
}
