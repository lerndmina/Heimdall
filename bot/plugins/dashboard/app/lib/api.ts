/**
 * Client-side API helper — calls the dashboard proxy route which
 * forwards to the bot API with auth.
 *
 * Supports optional client-side caching via localStorage.
 */
import { cache } from "./cache";

/** Standard API response envelope from the bot */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface FetchApiOptions extends RequestInit {
  /** localStorage cache key — if set, the response is cached and served from cache on subsequent calls */
  cacheKey?: string;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtl?: number;
  /** Skip reading from cache and force a fresh fetch (still writes to cache if cacheKey is set) */
  skipCache?: boolean;
}

/**
 * Fetch data from the bot API via the dashboard proxy.
 * @param guildId - The guild to scope the request to
 * @param path - API path after /api/guilds/:guildId/ (e.g. "minecraft/players")
 * @param options - Fetch options + optional cache config
 */
export async function fetchApi<T = unknown>(guildId: string, path: string, options?: FetchApiOptions): Promise<ApiResponse<T>> {
  const { cacheKey, cacheTtl, skipCache, ...fetchOptions } = options ?? {};

  // Check cache first
  if (cacheKey && !skipCache) {
    const cached = cache.get<ApiResponse<T>>(cacheKey);
    if (cached) return cached;
  }

  const url = `/api/guilds/${guildId}/${path}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions?.headers,
    },
    ...fetchOptions,
  });

  const data = (await res.json()) as ApiResponse<T>;

  // Write to cache on success
  if (cacheKey && data.success) {
    cache.set(cacheKey, data, cacheTtl);
  }

  return data;
}

/**
 * Fetch from a non-guild-scoped API route with optional caching.
 */
export async function fetchDashboardApi<T = unknown>(path: string, options?: FetchApiOptions): Promise<ApiResponse<T>> {
  const { cacheKey, cacheTtl, skipCache, ...fetchOptions } = options ?? {};

  // Check cache first
  if (cacheKey && !skipCache) {
    const cached = cache.get<ApiResponse<T>>(cacheKey);
    if (cached) return cached;
  }

  const res = await fetch(`/api/${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions?.headers,
    },
    ...fetchOptions,
  });

  const data = (await res.json()) as ApiResponse<T>;

  if (cacheKey && data.success) {
    cache.set(cacheKey, data, cacheTtl);
  }

  return data;
}
