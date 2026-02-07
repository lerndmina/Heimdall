/**
 * User guilds API — returns the current user's Discord guilds.
 *
 * Fetches from Discord API with in-memory caching (2 min TTL).
 * Replaces the old approach of storing guilds in the JWT.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserGuilds } from "@/lib/guildCache";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guilds = await getUserGuilds(session.accessToken, session.user.id);

  return NextResponse.json({ success: true, data: { guilds } });
}
