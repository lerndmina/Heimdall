/**
 * GuildGrid — client component that renders guild cards.
 *
 * Fetches guilds from /api/guilds (server-side cached Discord API call),
 * mutual guilds, and dashboard access on mount.
 *
 * Shows guilds where the user has Discord admin/manage perms OR dashboard
 * permission overrides. Refresh re-fetches everything fresh.
 */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import GuildIcon from "@/components/ui/GuildIcon";
import Spinner from "@/components/ui/Spinner";
import { cache } from "@/lib/cache";

/** Discord permission bits */
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  permissions?: string;
}

interface GuildGridProps {
  /** Discord application client ID — used to build invite URLs */
  clientId: string;
}

const MUTUAL_CACHE_KEY = "mutual-guilds";
const ACCESS_CACHE_KEY = "dashboard-access";
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

export default function GuildGrid({ clientId }: GuildGridProps) {
  const [guilds, setGuilds] = useState<Guild[] | null>(null);
  const [mutualIds, setMutualIds] = useState<Set<string> | null>(null);
  const [dashboardAccessIds, setDashboardAccessIds] = useState<Set<string> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /** Fetch guilds from the server-side cached endpoint */
  const fetchGuilds = useCallback(async () => {
    try {
      const res = await fetch("/api/guilds");
      const body = await res.json();
      if (body.success && Array.isArray(body.data?.guilds)) {
        return body.data.guilds as Guild[];
      }
    } catch {
      // ignore
    }
    return [];
  }, []);

  /** Which guilds the user has Discord admin/manage perms for */
  const discordPermGuildIds = useMemo(() => {
    const ids = new Set<string>();
    if (!guilds) return ids;
    for (const g of guilds) {
      if (!g.permissions) continue;
      const perms = BigInt(g.permissions);
      if ((perms & ADMINISTRATOR) !== 0n || (perms & MANAGE_GUILD) !== 0n) {
        ids.add(g.id);
      }
    }
    return ids;
  }, [guilds]);

  const fetchMutuals = useCallback(async (guildList: Guild[], skipCache = false) => {
    const ids = guildList.map((g) => g.id);

    if (!skipCache) {
      const cached = cache.get<string[]>(MUTUAL_CACHE_KEY);
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
        cache.set(MUTUAL_CACHE_KEY, mutuals, CACHE_TTL);
        setMutualIds(new Set(mutuals));
      } else {
        setMutualIds(new Set(ids));
      }
    } catch {
      setMutualIds(new Set(ids));
    }
  }, []);

  const fetchDashboardAccess = useCallback(async (guildList: Guild[], skipCache = false) => {
    const ids = guildList.map((g) => g.id);

    if (!skipCache) {
      const cached = cache.get<string[]>(ACCESS_CACHE_KEY);
      if (cached) {
        setDashboardAccessIds(new Set(cached));
        return;
      }
    }

    try {
      const res = await fetch("/api/dashboard-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildIds: ids }),
      });
      const body = await res.json();

      if (body.success && Array.isArray(body.data?.accessibleGuildIds)) {
        const accessible: string[] = body.data.accessibleGuildIds;
        cache.set(ACCESS_CACHE_KEY, accessible, CACHE_TTL);
        setDashboardAccessIds(new Set(accessible));
      } else {
        setDashboardAccessIds(new Set());
      }
    } catch {
      setDashboardAccessIds(new Set());
    }
  }, []);

  /** Initial load */
  useEffect(() => {
    (async () => {
      const guildList = await fetchGuilds();
      setGuilds(guildList);
      await Promise.all([fetchMutuals(guildList), fetchDashboardAccess(guildList)]);
    })();
  }, [fetchGuilds, fetchMutuals, fetchDashboardAccess]);

  /** Refresh button handler — bypasses all caches */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    cache.invalidate(MUTUAL_CACHE_KEY);
    cache.invalidate(ACCESS_CACHE_KEY);
    const guildList = await fetchGuilds();
    setGuilds(guildList);
    await Promise.all([fetchMutuals(guildList, true), fetchDashboardAccess(guildList, true)]);
    setIsRefreshing(false);
  };

  /**
   * When user clicks an invite link, invalidate caches so that
   * when they return (after adding the bot) we re-fetch fresh data.
   */
  const handleInviteClick = () => {
    cache.invalidate(MUTUAL_CACHE_KEY);
  };

  if (mutualIds === null || dashboardAccessIds === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading servers…" />
      </div>
    );
  }

  // A guild is shown if the user has Discord admin/manage perms OR dashboard access
  const visibleGuilds = (guilds ?? []).filter((g) => discordPermGuildIds.has(g.id) || dashboardAccessIds.has(g.id));

  // Sort: mutual (Manage) first, then invite
  const sorted = [...visibleGuilds].sort((a, b) => {
    const aM = mutualIds.has(a.id) ? 0 : 1;
    const bM = mutualIds.has(b.id) ? 0 : 1;
    return aM - bM;
  });

  if (visibleGuilds.length === 0) {
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-400">You don&apos;t have permission to manage any servers with Heimdall.</p>
        </div>
      </div>
    );
  }

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
          const hasDiscordPerms = discordPermGuildIds.has(guild.id);

          // Bot is in the server — user can manage
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

          // Bot not in server — user has Discord perms so they can invite
          if (hasDiscordPerms) {
            return (
              <a
                key={guild.id}
                href={buildInviteUrl(clientId, guild.id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleInviteClick}
                className="group flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-emerald-800/50 hover:bg-zinc-800/50">
                <GuildIcon name={guild.name} icon={guild.icon} guildId={guild.id} className="h-12 w-12 opacity-60 transition group-hover:opacity-100 group-hover:scale-105" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-300">{guild.name}</p>
                  <p className="text-xs text-zinc-600">Bot not in server</p>
                </div>
                <span className="shrink-0 rounded-md bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-400 transition group-hover:bg-emerald-600/30">Invite</span>
              </a>
            );
          }

          // Dashboard-only access, bot not in server — can't invite, just show as unavailable
          return (
            <div key={guild.id} className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 opacity-50">
              <GuildIcon name={guild.name} icon={guild.icon} guildId={guild.id} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-400">{guild.name}</p>
                <p className="text-xs text-zinc-600">Bot not in server</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
