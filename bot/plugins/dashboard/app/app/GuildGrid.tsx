/**
 * GuildGrid — client component that renders guild cards.
 *
 * Fetches guilds from /api/guilds (server-side cached Discord API call),
 * mutual guilds, and dashboard access on mount.
 *
 * Shows guilds where the user has Discord admin/manage perms OR dashboard
 * permission overrides. Refresh re-fetches everything fresh.
 *
 * Distinguishes between "no guilds" (legitimate) and "fetch failed" (transient)
 * to prevent first-load false-negatives. Auto-retries once on failure.
 */
"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import GuildIcon from "@/components/ui/GuildIcon";
import Spinner from "@/components/ui/Spinner";
import { cache } from "@/lib/cache";

/** Discord permission bits */
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

/** How many times to auto-retry when the initial load returns empty due to errors */
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

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

  // Track whether any fetch errored (vs returned legitimate empty data)
  const [hadFetchError, setHadFetchError] = useState(false);
  const retryCountRef = useRef(0);

  /** Fetch guilds from the server-side cached endpoint. Returns { guilds, ok }. */
  const fetchGuilds = useCallback(async (): Promise<{ guilds: Guild[]; ok: boolean }> => {
    try {
      const res = await fetch("/api/guilds");
      if (!res.ok) return { guilds: [], ok: false };
      const body = await res.json();
      if (body.success && Array.isArray(body.data?.guilds)) {
        return { guilds: body.data.guilds as Guild[], ok: true };
      }
      return { guilds: [], ok: false };
    } catch {
      return { guilds: [], ok: false };
    }
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

  const fetchMutuals = useCallback(async (guildList: Guild[], skipCache = false): Promise<boolean> => {
    const ids = guildList.map((g) => g.id);

    if (!skipCache) {
      const cached = cache.get<string[]>(MUTUAL_CACHE_KEY);
      if (cached) {
        setMutualIds(new Set(cached));
        return true;
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
        return true;
      } else {
        // Bot API responded but unexpected shape — assume all mutual (generous)
        setMutualIds(new Set(ids));
        return false;
      }
    } catch {
      // Bot API unreachable — assume all mutual (generous) but flag error
      setMutualIds(new Set(ids));
      return false;
    }
  }, []);

  const fetchDashboardAccess = useCallback(async (guildList: Guild[], skipCache = false): Promise<boolean> => {
    const ids = guildList.map((g) => g.id);

    if (!skipCache) {
      const cached = cache.get<string[]>(ACCESS_CACHE_KEY);
      if (cached) {
        setDashboardAccessIds(new Set(cached));
        return true;
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
        return true;
      } else {
        setDashboardAccessIds(new Set());
        return false;
      }
    } catch {
      // Bot API unreachable — flag error, don't cache empty result
      setDashboardAccessIds(new Set());
      return false;
    }
  }, []);

  /** Load all data, returns whether everything succeeded */
  const loadAll = useCallback(
    async (skipCache = false): Promise<boolean> => {
      const { guilds: guildList, ok: guildsOk } = await fetchGuilds();
      setGuilds(guildList);

      const [mutualsOk, accessOk] = await Promise.all([fetchMutuals(guildList, skipCache), fetchDashboardAccess(guildList, skipCache)]);

      const allOk = guildsOk && mutualsOk && accessOk;
      setHadFetchError(!allOk);
      return allOk;
    },
    [fetchGuilds, fetchMutuals, fetchDashboardAccess],
  );

  /** Initial load with auto-retry on failure */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await loadAll();

      // If the load had errors and we got no visible guilds, auto-retry
      // (handles first-load failures due to bot startup, rate limits, etc.)
      if (!ok && !cancelled && retryCountRef.current < MAX_AUTO_RETRIES) {
        retryCountRef.current++;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        if (!cancelled) {
          await loadAll(true); // skip localStorage cache on retry
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  /** Refresh button handler — bypasses all caches */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    cache.invalidate(MUTUAL_CACHE_KEY);
    cache.invalidate(ACCESS_CACHE_KEY);
    retryCountRef.current = 0;
    await loadAll(true);
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
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700/30 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-400 backdrop-blur-xl transition-all duration-300 hover:border-zinc-600/40 hover:text-zinc-200 hover:shadow-lg disabled:opacity-50">
            <svg className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="rounded-2xl border border-zinc-700/30 bg-zinc-900/40 p-12 text-center backdrop-blur-xl">
          {hadFetchError ? (
            <div className="space-y-3">
              <p className="text-zinc-300">Could not load your servers — the bot may still be starting up.</p>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-primary-500/25 transition-all hover:bg-primary-500 hover:shadow-primary-500/40 disabled:opacity-50">
                <svg className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isRefreshing ? "Retrying…" : "Try Again"}
              </button>
            </div>
          ) : (
            <p className="text-zinc-400">You don&apos;t have permission to manage any servers with Heimdall.</p>
          )}
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
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700/30 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-400 backdrop-blur-xl transition-all duration-300 hover:border-zinc-600/40 hover:text-zinc-200 hover:shadow-lg disabled:opacity-50">
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
                className="group relative flex items-center gap-4 rounded-2xl border border-zinc-700/30 bg-zinc-900/40 p-4 backdrop-blur-xl transition-all duration-500 hover:border-zinc-600/40 hover:shadow-2xl hover:shadow-primary-500/5">
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <GuildIcon name={guild.name} icon={guild.icon} guildId={guild.id} className="relative h-12 w-12 transition-transform duration-300 group-hover:scale-105" />
                <div className="relative min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-100">{guild.name}</p>
                  <p className="text-xs text-zinc-500">Click to manage</p>
                </div>
                <span className="relative shrink-0 rounded-md bg-primary-600/20 px-2.5 py-1 text-xs font-medium text-primary-400 transition-all duration-300 group-hover:bg-primary-600/30 group-hover:shadow-sm group-hover:shadow-primary-500/20">
                  Manage
                </span>
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
                className="group relative flex items-center gap-4 rounded-2xl border border-zinc-700/30 bg-zinc-900/30 p-4 backdrop-blur-xl transition-all duration-500 hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/5">
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <GuildIcon name={guild.name} icon={guild.icon} guildId={guild.id} className="relative h-12 w-12 opacity-60 transition-all duration-300 group-hover:opacity-100 group-hover:scale-105" />
                <div className="relative min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-300">{guild.name}</p>
                  <p className="text-xs text-zinc-600">Bot not in server</p>
                </div>
                <span className="relative shrink-0 rounded-md bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-400 transition-all duration-300 group-hover:bg-emerald-600/30 group-hover:shadow-sm group-hover:shadow-emerald-500/20">
                  Invite
                </span>
              </a>
            );
          }

          // Dashboard-only access, bot not in server — can't invite, just show as unavailable
          return (
            <div key={guild.id} className="flex items-center gap-4 rounded-2xl border border-zinc-700/30 bg-zinc-900/20 p-4 opacity-50 backdrop-blur-xl">
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
