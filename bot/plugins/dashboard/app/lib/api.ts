/**
 * Client-side API helper — calls the dashboard proxy route which
 * forwards to the bot API with auth.
 */

/** Standard API response envelope from the bot */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/**
 * Fetch data from the bot API via the dashboard proxy.
 * @param guildId - The guild to scope the request to
 * @param path - API path after /api/guilds/:guildId/ (e.g. "minecraft/players")
 * @param options - Fetch options (method, body, etc.)
 */
export async function fetchApi<T = unknown>(guildId: string, path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const url = `/api/guilds/${guildId}/${path}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  return res.json() as Promise<ApiResponse<T>>;
}
