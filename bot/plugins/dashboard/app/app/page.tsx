/**
 * Guild Selector — grid of accessible guilds from the user's session.
 * Server component: fetches the session on the server and renders the guild list.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import GuildGrid from "./GuildGrid";

export default async function GuildSelectorPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Select a Server</h1>
        <p className="text-zinc-400">
          Choose a server to manage. Only servers where you have <span className="text-zinc-300">Manage Server</span> permission are shown.
        </p>
      </div>

      {/* Guild grid */}
      {session.guilds.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-400">You don&apos;t have permission to manage any servers with Heimdall.</p>
        </div>
      ) : (
        <GuildGrid guilds={session.guilds} />
      )}
    </main>
  );
}
