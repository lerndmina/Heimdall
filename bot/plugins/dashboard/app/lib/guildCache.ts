/**
 * Guild Cache — In-memory cache for Discord guild lists.
 *
 * Fetches guilds from the Discord API using the user's OAuth access token,
 * caches results in memory with a short TTL so permission/role changes
 * are reflected without requiring re-login.
 */

interface CachedGuild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
}

interface CacheEntry {
  guilds: CachedGuild[];
  expiresAt: number;
}

/** In-memory cache keyed by userId */
const guildCache = new Map<string, CacheEntry>();

/** Cache TTL — 2 minutes */
const CACHE_TTL = 2 * 60_000;

/**
 * Evict expired entries periodically to prevent memory leaks.
 * Runs at most once per minute.
 */
let lastCleanup = 0;
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of guildCache) {
    if (now > entry.expiresAt) guildCache.delete(key);
  }
}

/**
 * Get the user's Discord guilds, using cache when available.
 *
 * @param accessToken  The user's Discord OAuth access token (from JWT)
 * @param userId       The user's Discord ID (cache key)
 * @returns Array of guilds with id, name, icon, and raw permissions string
 */
export async function getUserGuilds(accessToken: string, userId: string): Promise<CachedGuild[]> {
  cleanup();

  // Check cache
  const cached = guildCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.guilds;
  }

  // Fetch fresh from Discord API
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      // If we have stale cache, return it rather than nothing
      if (cached) return cached.guilds;
      return [];
    }

    const raw = await res.json();
    const guilds: CachedGuild[] = raw.map((g: { id: string; name: string; icon: string | null; permissions: string }) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      permissions: g.permissions,
    }));

    guildCache.set(userId, { guilds, expiresAt: Date.now() + CACHE_TTL });
    return guilds;
  } catch {
    // Network error — return stale cache if available
    if (cached) return cached.guilds;
    return [];
  }
}

/**
 * Invalidate the cache for a specific user (e.g. on sign-out).
 */
export function invalidateUserGuilds(userId: string): void {
  guildCache.delete(userId);
}
