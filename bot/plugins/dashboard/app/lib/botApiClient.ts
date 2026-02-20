/**
 * Shared server-side bot API client.
 *
 * Used by Next.js route handlers to call the bot's internal API.
 * Provides two key performance features:
 *
 *  1. TTL cache — avoids redundant round-trips for data that doesn't
 *     change between pageloads (member roles, permission defs, etc.)
 *
 *  2. In-flight deduplication — if N concurrent requests all need the
 *     same cache key before the first resolves, only ONE HTTP request
 *     is made and all N callers await the same promise. This prevents
 *     the classic cache stampede that causes 4-5× member lookups on
 *     every settings page load.
 */

const API_PORT = process.env.API_PORT || "3001";
export const API_BASE = `http://localhost:${API_PORT}`;
export const API_KEY = process.env.INTERNAL_API_KEY!;

// ── TTLs (milliseconds) ─────────────────────────────────────────────────────
/** Who the user is and what roles they have. Short enough to pick up role changes. */
export const TTL_MEMBER = 60_000; // 60 s
/** Guild-level permission overrides saved by admins. */
export const TTL_PERMISSIONS = 30_000; // 30 s
/** Static permission definitions (effectively compile-time, rarely changes in prod). */
export const TTL_PERMISSION_DEFS = 5 * 60_000; // 5 min
/** Dashboard toggle settings (hideDeniedFeatures etc.). */
export const TTL_SETTINGS = 30_000; // 30 s

// ── Internal cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();
const _inflight = new Map<string, Promise<unknown>>();

function _getCached<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function _setCache(key: string, data: unknown, ttl: number): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch a JSON resource from the bot API.
 *
 * @param path      Full path beginning with `/api/...`
 * @param cacheKey  If provided, the response is cached and concurrent
 *                  callers share a single in-flight request.
 * @param ttl       Cache lifetime in ms (ignored when cacheKey is omitted).
 */
export async function fetchBotApi<T>(path: string, cacheKey?: string, ttl = TTL_MEMBER): Promise<T | null> {
  // 1. Cache hit — return immediately
  if (cacheKey) {
    const hit = _getCached<T>(cacheKey);
    if (hit !== null) return hit;

    // 2. In-flight deduplication — return the existing promise if one is running
    const pending = _inflight.get(cacheKey);
    if (pending) return pending as Promise<T | null>;
  }

  // 3. Initiate a new request
  const request = (async (): Promise<T | null> => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "X-API-Key": API_KEY },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { success: boolean; data?: T };
      if (!json.success) return null;
      if (cacheKey) _setCache(cacheKey, json.data, ttl);
      return json.data ?? null;
    } catch {
      return null;
    } finally {
      // Always clean up in-flight entry so a later caller can retry
      if (cacheKey) _inflight.delete(cacheKey);
    }
  })();

  if (cacheKey) _inflight.set(cacheKey, request);
  return request;
}

/**
 * Explicitly invalidate a cache entry (e.g. after a write operation).
 */
export function invalidateBotApiCache(cacheKey: string): void {
  _cache.delete(cacheKey);
}
