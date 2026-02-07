/**
 * GuildGrid — client component that renders clickable guild cards.
 */
"use client";

import Link from "next/link";
import { guildIconUrl } from "@/lib/discord";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export default function GuildGrid({ guilds }: { guilds: Guild[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {guilds.map((guild) => (
        <Link key={guild.id} href={`/${guild.id}`} className="group flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-700 hover:bg-zinc-800/70">
          <img src={guildIconUrl(guild.id, guild.icon)} alt={guild.name} className="h-12 w-12 rounded-full transition group-hover:scale-105" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-100">{guild.name}</p>
            <p className="text-xs text-zinc-500">Click to manage</p>
          </div>
          <svg className="h-5 w-5 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ))}
    </div>
  );
}
