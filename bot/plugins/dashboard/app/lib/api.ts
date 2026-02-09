/**
 * Client-side API helper — calls the dashboard proxy route which
 * forwards to the bot API with auth.
 *
 * Supports optional client-side caching via localStorage and
 * in-flight request deduplication (multiple callers for the same
 * URL share a single network request).
 */
import { cache } from "./cache";

/**
 * In-flight request map for deduplication.
 * Key = URL, Value = pending promise.
 * When multiple components request the same URL before the first
 * resolves, they all await the same promise instead of firing
 * duplicate network requests.
 */
const inflightRequests = new Map<string, Promise<ApiResponse<any>>>();

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

  // Only deduplicate GET requests (or requests with no method / body)
  const isGet = !fetchOptions?.method || fetchOptions.method === "GET";

  if (isGet) {
    const inflight = inflightRequests.get(url);
    if (inflight) return inflight as Promise<ApiResponse<T>>;
  }

  const request = (async (): Promise<ApiResponse<T>> => {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions?.headers,
      },
      ...fetchOptions,
    });

    let data: ApiResponse<T>;

    try {
      data = (await res.json()) as ApiResponse<T>;
    } catch {
      // If JSON parsing fails, create error response based on HTTP status
      data = {
        success: false,
        error: {
          code: res.status === 403 ? "FORBIDDEN" : res.status === 401 ? "UNAUTHORIZED" : "PARSE_ERROR",
          message: res.status === 403 ? "Access denied" : res.status === 401 ? "Unauthorized" : "Failed to parse response",
        },
      };
      return data;
    }

    // If HTTP status indicates error, ensure error object includes proper code
    if (!res.ok) {
      // Create error object if it doesn't exist
      if (!data.error) {
        data.error = {
          code: "UNKNOWN",
          message: `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      // Override error code based on HTTP status
      if (res.status === 403) {
        data.error.code = "FORBIDDEN";
      } else if (res.status === 401) {
        data.error.code = "UNAUTHORIZED";
      }

      data.success = false;
    }

    // Write to cache on success
    if (cacheKey && data.success) {
      cache.set(cacheKey, data, cacheTtl);
    }

    return data;
  })();

  // Register in-flight promise and clean up when done
  if (isGet) {
    inflightRequests.set(url, request);
    request.finally(() => inflightRequests.delete(url));
  }

  return request;
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

  const url = `/api/${path}`;

  // Only deduplicate GET requests
  const isGet = !fetchOptions?.method || fetchOptions.method === "GET";

  if (isGet) {
    const inflight = inflightRequests.get(url);
    if (inflight) return inflight as Promise<ApiResponse<T>>;
  }

  const request = (async (): Promise<ApiResponse<T>> => {
    const res = await fetch(url, {
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
  })();

  if (isGet) {
    inflightRequests.set(url, request);
    request.finally(() => inflightRequests.delete(url));
  }

  return request;
}
