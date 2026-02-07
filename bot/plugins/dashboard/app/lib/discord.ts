/**
 * Discord CDN helpers.
 */

/** Build a Discord guild icon URL, with a default fallback. */
export function guildIconUrl(guildId: string, icon: string | null, size = 128): string {
  if (!icon) {
    // Default Discord guild avatar — index based on guild id
    const index = Number(BigInt(guildId) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const ext = icon.startsWith("a_") ? "gif" : "webp";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=${size}`;
}
