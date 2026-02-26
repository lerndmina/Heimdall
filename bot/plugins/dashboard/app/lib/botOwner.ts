import "server-only";

/**
 * Bot owner check utility — queries the bot API to determine if a user
 * is listed in OWNER_IDS. Results are cached for 5 minutes.
 */

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;

/** Simple cache: userId → { isBotOwner, expiresAt } */
const ownerCache = new Map<string, { result: boolean; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a user is a bot owner (listed in OWNER_IDS env).
 * Results are cached for 5 minutes to avoid hammering the bot API.
 */
export async function checkBotOwner(userId: string): Promise<boolean> {
  const cached = ownerCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    const res = await fetch(`${API_BASE}/api/bot-owner`, {
      method: "GET",
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      ownerCache.set(userId, { result: false, expiresAt: Date.now() + CACHE_TTL });
      return false;
    }

    const json = await res.json();
    const isBotOwner = json.success === true && json.data?.isBotOwner === true;

    ownerCache.set(userId, { result: isBotOwner, expiresAt: Date.now() + CACHE_TTL });
    return isBotOwner;
  } catch {
    return false;
  }
}
