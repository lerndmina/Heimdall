/**
 * Client-side cache backed by localStorage.
 *
 * Usage:
 *   cache.set("mutual-guilds", data, 5 * 60_000);   // 5 min TTL
 *   cache.get<string[]>("mutual-guilds");             // returns data or null
 *   cache.invalidate("mutual-guilds");                // remove one key
 *   cache.invalidatePrefix("guild:");                 // remove all keys with prefix
 *
 * All keys are namespaced under "hdash:" to avoid collisions.
 */

const NAMESPACE = "hdash:";

interface CacheEntry<T> {
  data: T;
  /** Unix timestamp (ms) when this entry expires */
  expiresAt: number;
}

/**
 * Get a cached value. Returns `null` if missing or expired.
 */
function get<T = unknown>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(NAMESPACE + key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);

    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(NAMESPACE + key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Store a value in the cache with a TTL.
 * @param key   Cache key
 * @param data  Data to store (must be JSON-serialisable)
 * @param ttl   Time-to-live in milliseconds (default: 5 minutes)
 */
function set<T>(key: string, data: T, ttl = 5 * 60_000): void {
  if (typeof window === "undefined") return;

  const entry: CacheEntry<T> = {
    data,
    expiresAt: Date.now() + ttl,
  };

  try {
    localStorage.setItem(NAMESPACE + key, JSON.stringify(entry));
  } catch {
    // localStorage full or disabled — silently ignore
  }
}

/**
 * Remove a single key from the cache.
 */
function invalidate(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(NAMESPACE + key);
}

/**
 * Remove all cached keys that start with a given prefix.
 */
function invalidatePrefix(prefix: string): void {
  if (typeof window === "undefined") return;

  const fullPrefix = NAMESPACE + prefix;
  const toRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(fullPrefix)) {
      toRemove.push(k);
    }
  }

  for (const k of toRemove) {
    localStorage.removeItem(k);
  }
}

/**
 * Remove ALL dashboard cache entries.
 */
function clear(): void {
  invalidatePrefix("");
}

export const cache = { get, set, invalidate, invalidatePrefix, clear };
