/**
 * Discord CDN helpers.
 */

/**
 * Build a Discord guild icon URL.
 * Returns `null` when the guild has no custom icon.
 * Animated icons use gif extension.
 */
export function guildIconUrl(guildId: string, icon: string | null, size = 128): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "webp";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

/**
 * Build a **static** guild icon URL (always webp, never animated).
 * Use this for the resting state; swap to `guildIconUrl` on hover.
 */
export function guildIconUrlStatic(guildId: string, icon: string | null, size = 128): string | null {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.webp?size=${size}`;
}

/** Whether a guild icon hash is animated. */
export function isAnimatedIcon(icon: string | null): boolean {
  return !!icon && icon.startsWith("a_");
}

/**
 * Get the guild initials — first letter of each word, up to 3 characters.
 * Matches Discord's default server icon style.
 *
 * "Testee"           → "T"
 * "My cool Server"   → "McS"
 * "A B C D"          → "ABC"
 */
export function guildInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]!)
    .join("");
}
