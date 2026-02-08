/**
 * Media link detection utilities.
 * Detects GIF/media hosting platform links in message content.
 * Separates GIF links from video links for granular control.
 * Ported from the legacy blockAttachments event handler.
 */

import { AttachmentType } from "./attachment-types.js";

/** Regex patterns specifically for GIF hosting / GIF links */
const GIF_LINK_PATTERNS: RegExp[] = [
  // Direct .gif links
  /https?:\/\/[^\s]+\.gif(?:\?[^\s]*)?/gi,
  // Imgur GIF patterns
  /https?:\/\/(?:i\.)?imgur\.com\/[a-zA-Z0-9]+\.gif/gi,
  // Tenor patterns (always GIF/animated)
  /https?:\/\/tenor\.com\/view\/[^\s]+/gi,
  /https?:\/\/c\.tenor\.com\/[^\s]+/gi,
  /https?:\/\/media\.tenor\.com\/[^\s]+/gi,
  // Giphy patterns (always GIF)
  /https?:\/\/giphy\.com\/gifs\/[^\s]+/gi,
  /https?:\/\/media\.giphy\.com\/media\/[a-zA-Z0-9]+\/giphy\.gif/gi,
  /https?:\/\/i\.giphy\.com\/[a-zA-Z0-9]+\.gif/gi,
  // Discord CDN .gif
  /https?:\/\/cdn\.discordapp\.com\/attachments\/[0-9]+\/[0-9]+\/[^\s]+\.gif/gi,
  /https?:\/\/media\.discordapp\.net\/attachments\/[0-9]+\/[0-9]+\/[^\s]+\.gif/gi,
  // Reddit .gif
  /https?:\/\/i\.redd\.it\/[^\s]+\.gif/gi,
  // Gfycat (always animated)
  /https?:\/\/gfycat\.com\/[a-zA-Z0-9]+/gi,
  /https?:\/\/thumbs\.gfycat\.com\/[^\s]+/gi,
  // Redgifs (always animated)
  /https?:\/\/(?:www\.)?redgifs\.com\/watch\/[a-zA-Z0-9]+/gi,
  // .gifv links
  /https?:\/\/[^\s]*\.gifv(?:\?[^\s]*)?/gi,
];

/** Regex patterns for video links (not GIFs) */
const VIDEO_LINK_PATTERNS: RegExp[] = [
  // Direct video file links
  /https?:\/\/[^\s]+\.(?:mp4|webm|mov|avi|mkv|flv|wmv)(?:\?[^\s]*)?/gi,
  // Imgur gallery/album (may contain videos)
  /https?:\/\/imgur\.com\/gallery\/[a-zA-Z0-9]+/gi,
  /https?:\/\/imgur\.com\/a\/[a-zA-Z0-9]+/gi,
];

/**
 * Detect GIF links in message content.
 * Returns a deduplicated array of matched GIF URLs.
 */
export function detectGifLinks(content: string): string[] {
  const links: string[] = [];
  for (const pattern of GIF_LINK_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) links.push(...matches);
  }
  return [...new Set(links)];
}

/**
 * Detect video links in message content.
 * Returns a deduplicated array of matched video URLs.
 */
export function detectVideoLinks(content: string): string[] {
  const links: string[] = [];
  for (const pattern of VIDEO_LINK_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) links.push(...matches);
  }
  return [...new Set(links)];
}

/**
 * Detect all media links in a string (GIFs + videos combined).
 * Returns a deduplicated array of matched URLs.
 */
export function detectMediaLinks(content: string): string[] {
  return [...new Set([...detectGifLinks(content), ...detectVideoLinks(content)])];
}

/**
 * Detect media links filtered by which types are disallowed.
 * Only returns links of types NOT in the allowed list.
 */
export function detectDisallowedLinks(content: string, allowedTypes: AttachmentType[]): { links: string[]; category: "gif" | "video" | "media" } | null {
  const isGifAllowed = allowedTypes.includes(AttachmentType.GIF) || allowedTypes.includes(AttachmentType.ALL);
  const isVideoAllowed = allowedTypes.includes(AttachmentType.VIDEO) || allowedTypes.includes(AttachmentType.ALL);

  // Both allowed → nothing to block
  if (isGifAllowed && isVideoAllowed) return null;

  const blockedLinks: string[] = [];
  let category: "gif" | "video" | "media" = "media";

  if (!isGifAllowed) {
    const gifLinks = detectGifLinks(content);
    if (gifLinks.length > 0) {
      blockedLinks.push(...gifLinks);
      category = "gif";
    }
  }

  if (!isVideoAllowed) {
    const videoLinks = detectVideoLinks(content);
    if (videoLinks.length > 0) {
      blockedLinks.push(...videoLinks);
      category = blockedLinks.length > videoLinks.length ? "media" : "video";
    }
  }

  if (blockedLinks.length === 0) return null;
  return { links: [...new Set(blockedLinks)], category };
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
    } else if (/\.gif(v)?(\?|$)/i.test(link)) {
      types.add("GIF");
    } else if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(link)) {
      types.add("Video");
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
