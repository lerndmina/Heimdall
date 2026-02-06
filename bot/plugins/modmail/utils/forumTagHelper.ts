/**
 * Forum Tag Helper - Creates Open/Closed forum tags for modmail channels
 *
 * Shared between setup and category creation to ensure all forum channels
 * used by modmail categories have proper status tags.
 */

import type { ForumChannel, GuildForumTagData } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("modmail:forum-tags");

/**
 * Create or find Open/Closed forum tags on a forum channel.
 * Returns the tag IDs for storing on the category.
 *
 * Idempotent — if tags already exist, returns their IDs without duplicating.
 */
export async function createForumTags(forumChannel: ForumChannel): Promise<{ openTagId: string; closedTagId: string } | null> {
  try {
    const existingTags = forumChannel.availableTags;

    // Check if tags already exist
    let openTag = existingTags.find((t) => t.name.toLowerCase() === "open" || t.name.toLowerCase() === "🟢 open");
    let closedTag = existingTags.find((t) => t.name.toLowerCase() === "closed" || t.name.toLowerCase() === "🔴 closed");

    const tagsToAdd: GuildForumTagData[] = [...existingTags];

    // Create Open tag if it doesn't exist
    if (!openTag) {
      tagsToAdd.push({
        name: "🟢 Open",
        moderated: true,
        emoji: null,
      });
    }

    // Create Closed tag if it doesn't exist
    if (!closedTag) {
      tagsToAdd.push({
        name: "🔴 Closed",
        moderated: true,
        emoji: null,
      });
    }

    // If we need to add tags, update the forum channel
    if (!openTag || !closedTag) {
      const updatedChannel = await forumChannel.setAvailableTags(tagsToAdd, "Modmail - creating status tags");

      openTag = updatedChannel.availableTags.find((t) => t.name === "🟢 Open");
      closedTag = updatedChannel.availableTags.find((t) => t.name === "🔴 Closed");
    }

    if (!openTag || !closedTag) {
      return null;
    }

    return {
      openTagId: openTag.id,
      closedTagId: closedTag.id,
    };
  } catch (error) {
    log.error("Failed to create forum tags:", error);
    return null;
  }
}
