/**
 * GuildGrid — client component that renders guild cards.
 *
 * Fetches mutual guilds on mount (cached in localStorage for 5 min),
 * shows "Manage" for mutual guilds and "Invite" for non-mutual.
 * Clicking "Invite" invalidates the cache so the list refreshes
 * when the user returns after adding the bot.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import GuildIcon from "@/components/ui/GuildIcon";
import Spinner from "@/components/ui/Spinner";
import { cache } from "@/lib/cache";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

interface GuildGridProps {
  guilds: Guild[];
  /** Discord application client ID — used to build invite URLs */
  clientId: string;
}

const CACHE_KEY = "mutual-guilds";
const CACHE_TTL = 5 * 60_000; // 5 minutes

function buildInviteUrl(clientId: string, guildId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: "8",
    scope: "bot applications.commands",
    guild_id: guildId,
    disable_guild_select: "true",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export default function GuildGrid({ guilds, clientId }: GuildGridProps) {
  const [mutualIds, setMutualIds] = useState<Set<string> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchMutuals = useCallback(
    async (skipCache = false) => {
      const ids = guilds.map((g) => g.id);

      // Check localStorage cache first
      if (!skipCache) {
        const cached = cache.get<string[]>(CACHE_KEY);
        if (cached) {
          setMutualIds(new Set(cached));
          return;
        }
      }

      try {
        const res = await fetch("/api/mutual-guilds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guildIds: ids }),
        });
        const body = await res.json();

        if (body.success && Array.isArray(body.data?.mutualIds)) {
          const mutuals: string[] = body.data.mutualIds;
          cache.set(CACHE_KEY, mutuals, CACHE_TTL);
          setMutualIds(new Set(mutuals));
        } else {
          // API failed — show all as mutual so user can still click through
          setMutualIds(new Set(ids));
        }
      } catch {
        setMutualIds(new Set(ids));
      }
    },
    [guilds],
  );

  useEffect(() => {
    fetchMutuals();
  }, [fetchMutuals]);

  /** Refresh button handler — bypasses cache */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    cache.invalidate(CACHE_KEY);
    await fetchMutuals(true);
    setIsRefreshing(false);
  };

  /**
   * When user clicks an invite link, invalidate the cache so that
   * when they return (after adding the bot) we re-fetch fresh data.
   */
  const handleInviteClick = (guildId: string) => {
    cache.invalidate(CACHE_KEY);
    // The link opens in a new tab via href — no need to prevent default
  };

  if (mutualIds === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading servers…" />
      </div>
    );
  }

  // Sort: mutual (Manage) first, then invite
  const sorted = [...guilds].sort((a, b) => {
    const aM = mutualIds.has(a.id) ? 0 : 1;
    const bM = mutualIds.has(b.id) ? 0 : 1;
    return aM - bM;
  });

  return (
    <div className="space-y-4">
      {/* Refresh bar */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50">
          <svg className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Guild cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((guild) => {
          const isMutual = mutualIds.has(guild.id);

          if (isMutual) {
            return (
              <Link
                key={guild.id}
                href={`/${guild.id}`}
                className="group flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-700 hover:bg-zinc-800/70">
                <GuildIcon name={guild.name} icon={guild.icon} guildId={guild.id} className="h-12 w-12 transition group-hover:scale-105" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-100">{guild.name}</p>
                  <p className="text-xs text-zinc-500">Click to manage</p>
                </div>
                <span className="shrink-0 rounded-md bg-primary-600/20 px-2.5 py-1 text-xs font-medium text-primary-400 transition group-hover:bg-primary-600/30">Manage</span>
              </Link>
            );
          }

          return (
            <a
              key={guild.id}
              href={buildInviteUrl(clientId, guild.id)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleInviteClick(guild.id)}
              className="group flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-emerald-800/50 hover:bg-zinc-800/50">
              <GuildIcon name={guild.name} icon={guild.icon} guildId={guild.id} className="h-12 w-12 opacity-60 transition group-hover:opacity-100 group-hover:scale-105" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-300">{guild.name}</p>
                <p className="text-xs text-zinc-600">Bot not in server</p>
              </div>
              <span className="shrink-0 rounded-md bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-400 transition group-hover:bg-emerald-600/30">Invite</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
