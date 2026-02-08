/**
 * Purge Filters — Predicate factories for message filtering.
 *
 * Each factory returns a `(message: Message) => boolean` predicate.
 * Compose multiple predicates with `combinedFilter` for AND logic.
 */

import type { Message } from "discord.js";
import { BULK_DELETE_MAX_AGE_MS } from "./constants.js";

// ── Filter Predicates ────────────────────────────────────

/** Messages from a specific user */
export function byUser(userId: string): (message: Message) => boolean {
  return (message) => message.author.id === userId;
}

/** Bot messages only */
export function byBots(): (message: Message) => boolean {
  return (message) => message.author.bot;
}

/** Content matches a regex pattern */
export function byContent(pattern: string): (message: Message) => boolean {
  try {
    const regex = new RegExp(pattern, "i");
    return (message) => regex.test(message.content);
  } catch {
    return () => false;
  }
}

/** Messages with any attachment */
export function byHasAttachments(): (message: Message) => boolean {
  return (message) => message.attachments.size > 0;
}

/** Messages with attachments of specific MIME type prefix */
export function byAttachmentType(type: string): (message: Message) => boolean {
  return (message) =>
    message.attachments.some((a) => {
      const contentType = a.contentType?.toLowerCase() ?? "";
      return contentType.startsWith(type.toLowerCase());
    });
}

/** Messages with embeds */
export function byHasEmbeds(): (message: Message) => boolean {
  return (message) => message.embeds.length > 0;
}

/** Messages containing GIF attachments or tenor/giphy links */
export function byGifsAndTenor(): (message: Message) => boolean {
  const gifUrlRegex = /(?:tenor\.com|giphy\.com)/i;
  return (message) => {
    // Check for GIF attachments
    const hasGifAttachment = message.attachments.some((a) => a.contentType?.toLowerCase().includes("image/gif") ?? false);
    // Check for tenor/giphy URLs in content
    const hasTenorGiphy = gifUrlRegex.test(message.content);
    // Check for tenor/giphy embed URLs
    const hasGifEmbed = message.embeds.some((e) => (e.url && gifUrlRegex.test(e.url)) || (e.thumbnail?.url && gifUrlRegex.test(e.thumbnail.url)));
    return hasGifAttachment || hasTenorGiphy || hasGifEmbed;
  };
}

/** Messages containing URLs */
export function byLinks(): (message: Message) => boolean {
  const urlRegex = /https?:\/\/[^\s]+/i;
  return (message) => urlRegex.test(message.content);
}

/** Messages within bulk-delete age (under 14 days old) */
export function byNotTooOld(): (message: Message) => boolean {
  return (message) => Date.now() - message.createdTimestamp < BULK_DELETE_MAX_AGE_MS;
}

// ── Combinator ───────────────────────────────────────────

/**
 * AND-compose all predicates. Message must pass all filters.
 */
export function combinedFilter(filters: Array<(message: Message) => boolean>): (message: Message) => boolean {
  return (message) => filters.every((filter) => filter(message));
}
