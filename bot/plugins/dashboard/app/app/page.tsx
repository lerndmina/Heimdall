/**
 * Guild Selector — grid of accessible guilds.
 * Server component shell; GuildGrid fetches guilds client-side
 * via the /api/guilds endpoint (backed by in-memory cache).
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import GuildGrid from "./GuildGrid";
import LogoutButton from "./LogoutButton";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;

export default async function GuildSelectorPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">Select a Server</h1>
          <p className="text-zinc-400">
            Choose a server to manage. Servers where you have <span className="text-zinc-300">Manage Server</span> permission or dashboard access are shown.
          </p>
        </div>
        <LogoutButton user={session.user} />
      </div>

      {/* Guild grid */}
      <GuildGrid clientId={DISCORD_CLIENT_ID} />
    </main>
  );
}
