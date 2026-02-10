/**
 * Escape special regex characters in a string so it can be safely
 * used inside `new RegExp(...)` or a MongoDB `$regex` query.
 *
 * @param str  The raw user-supplied string
 * @returns    The escaped string safe for regex interpolation
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
