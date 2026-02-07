/**
 * Guild Cache — In-memory cache for Discord guild lists.
 *
 * Fetches guilds from the Discord API using the user's OAuth access token,
 * caches results in memory with a short TTL so permission/role changes
 * are reflected without requiring re-login.
 *
 * Concurrent requests for the same user are deduplicated — only one Discord
 * API call is made and all callers share the result. This prevents rate-limit
 * 403s when multiple proxy routes fire simultaneously (e.g. after a restart).
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

/** In-flight fetch promises keyed by userId — prevents duplicate Discord API calls */
const inflightRequests = new Map<string, Promise<CachedGuild[]>>();

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
 * Actually fetch guilds from Discord API (not deduplicated — internal use only).
 */
async function fetchGuildsFromDiscord(accessToken: string, userId: string): Promise<CachedGuild[]> {
  const cached = guildCache.get(userId);

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
 * Get the user's Discord guilds, using cache when available.
 *
 * Concurrent calls for the same user are deduplicated so only one
 * Discord API request is made — all callers share the same result.
 *
 * @param accessToken  The user's Discord OAuth access token (from JWT)
 * @param userId       The user's Discord ID (cache key)
 * @returns Array of guilds with id, name, icon, and raw permissions string
 */
export async function getUserGuilds(accessToken: string, userId: string): Promise<CachedGuild[]> {
  cleanup();

  // Check cache first
  const cached = guildCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.guilds;
  }

  // If there's already an in-flight request for this user, piggy-back on it
  const inflight = inflightRequests.get(userId);
  if (inflight) {
    return inflight;
  }

  // Start a new fetch and register it so concurrent callers share it
  const promise = fetchGuildsFromDiscord(accessToken, userId).finally(() => {
    inflightRequests.delete(userId);
  });

  inflightRequests.set(userId, promise);
  return promise;
}

/**
 * Invalidate the cache for a specific user (e.g. on sign-out).
 */
export function invalidateUserGuilds(userId: string): void {
  guildCache.delete(userId);
}
