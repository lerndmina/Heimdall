/**
 * Media link detection utilities.
 * Detects GIF/media hosting platform links in message content.
 * Ported from the legacy blockAttachments event handler.
 */

/** Regex patterns for detecting media/GIF links */
const MEDIA_LINK_PATTERNS: RegExp[] = [
  // Direct .gif links
  /https?:\/\/[^\s]+\.gif(?:\?[^\s]*)?/gi,
  // Imgur patterns
  /https?:\/\/(?:i\.)?imgur\.com\/[a-zA-Z0-9]+(?:\.gif)?/gi,
  /https?:\/\/imgur\.com\/gallery\/[a-zA-Z0-9]+/gi,
  /https?:\/\/imgur\.com\/a\/[a-zA-Z0-9]+/gi,
  // Tenor patterns
  /https?:\/\/tenor\.com\/view\/[^\s]+/gi,
  /https?:\/\/c\.tenor\.com\/[^\s]+/gi,
  /https?:\/\/media\.tenor\.com\/[^\s]+/gi,
  // Giphy patterns
  /https?:\/\/giphy\.com\/gifs\/[^\s]+/gi,
  /https?:\/\/media\.giphy\.com\/media\/[a-zA-Z0-9]+\/giphy\.gif/gi,
  /https?:\/\/i\.giphy\.com\/[a-zA-Z0-9]+\.gif/gi,
  // Discord CDN
  /https?:\/\/cdn\.discordapp\.com\/attachments\/[0-9]+\/[0-9]+\/[^\s]+\.gif/gi,
  /https?:\/\/media\.discordapp\.net\/attachments\/[0-9]+\/[0-9]+\/[^\s]+\.gif/gi,
  // Reddit
  /https?:\/\/i\.redd\.it\/[^\s]+\.gif/gi,
  // Gfycat
  /https?:\/\/gfycat\.com\/[a-zA-Z0-9]+/gi,
  /https?:\/\/thumbs\.gfycat\.com\/[^\s]+/gi,
  // Redgifs
  /https?:\/\/(?:www\.)?redgifs\.com\/watch\/[a-zA-Z0-9]+/gi,
  // Generic media patterns (.gifv, .webm, .mp4)
  /https?:\/\/[^\s]*(?:gif|gifv|webm|mp4)(?:\?[^\s]*)?/gi,
];

/**
 * Detect all media links in a string.
 * Returns a deduplicated array of matched URLs.
 */
export function detectMediaLinks(content: string): string[] {
  const links: string[] = [];

  for (const pattern of MEDIA_LINK_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) {
      links.push(...matches);
    }
  }

  // Deduplicate
  return [...new Set(links)];
}

/**
 * Categorize detected links by their source for user-facing messages.
 */
export function getDetectedLinkTypes(links: string[]): string {
  const types = new Set<string>();

  for (const link of links) {
    if (link.includes("imgur.com")) {
      types.add("Imgur");
    } else if (link.includes("tenor.com")) {
      types.add("Tenor");
    } else if (link.includes("giphy.com")) {
      types.add("Giphy");
    } else if (link.includes("gfycat.com")) {
      types.add("Gfycat");
    } else if (link.includes("redgifs.com")) {
      types.add("Redgifs");
    } else if (link.includes("discord")) {
      types.add("Discord");
    } else if (link.includes("redd.it")) {
      types.add("Reddit");
    } else if (link.endsWith(".gif")) {
      types.add("GIF");
    } else {
      types.add("Media");
    }
  }

  const typeArray = Array.from(types);
  if (typeArray.length === 1) {
    return `${typeArray[0]} link${links.length > 1 ? "s" : ""}`;
  }
  return "Media links";
}
