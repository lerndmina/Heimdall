/**
 * TagService — CRUD, usage tracking, and autocomplete search for guild tags
 */

import { createLogger } from "../../../src/core/Logger.js";
import TagModel, { type ITag } from "../models/Tag.js";

const log = createLogger("tags:service");

/** Tag document with Mongoose metadata */
type TagDocument = ITag & { _id: any; createdAt: Date; updatedAt: Date };

/** Validation regex: alphanumeric, hyphens, underscores only */
const TAG_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export class TagService {
  // ── CRUD ────────────────────────────────────────────────

  /** Get a single tag by guild + name, or null. */
  async getTag(guildId: string, name: string): Promise<TagDocument | null> {
    return TagModel.findOne({ guildId, name: name.toLowerCase() });
  }

  /** List all tags for a guild, optionally filtered by a search term. */
  async listTags(guildId: string, options?: { search?: string; sort?: "name" | "uses" | "createdAt"; limit?: number; offset?: number }): Promise<{ tags: TagDocument[]; total: number }> {
    const { search, sort = "name", limit = 50, offset = 0 } = options ?? {};

    const query: Record<string, unknown> = { guildId };
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const sortObj: Record<string, 1 | -1> = {};
    if (sort === "name") sortObj.name = 1;
    else if (sort === "uses") sortObj.uses = -1;
    else if (sort === "createdAt") sortObj.createdAt = -1;

    const [tags, total] = await Promise.all([TagModel.find(query).sort(sortObj).limit(limit).skip(offset).lean() as Promise<TagDocument[]>, TagModel.countDocuments(query)]);

    return { tags, total };
  }

  /** Create a new tag. Returns the created tag or null if it already exists. */
  async createTag(guildId: string, name: string, content: string, createdBy: string): Promise<TagDocument | null> {
    const normalizedName = name.toLowerCase().trim();

    // Validate name format
    if (!TAG_NAME_REGEX.test(normalizedName)) {
      throw new Error("Tag name can only contain letters, numbers, hyphens, and underscores");
    }
    if (normalizedName.length > 32) {
      throw new Error("Tag name must be 32 characters or less");
    }
    if (content.length > 2000) {
      throw new Error("Tag content must be 2000 characters or less");
    }

    // Check for duplicate
    const existing = await TagModel.findOne({ guildId, name: normalizedName });
    if (existing) return null;

    const tag = await TagModel.create({
      guildId,
      name: normalizedName,
      content,
      createdBy,
      uses: 0,
    });

    log.debug(`Tag "${normalizedName}" created in guild ${guildId} by ${createdBy}`);
    return tag as unknown as TagDocument;
  }

  /** Update an existing tag's content. Returns null if not found. */
  async updateTag(guildId: string, name: string, content: string): Promise<TagDocument | null> {
    if (content.length > 2000) {
      throw new Error("Tag content must be 2000 characters or less");
    }

    const tag = await TagModel.findOneAndUpdate({ guildId, name: name.toLowerCase() }, { $set: { content } }, { new: true, runValidators: true });
    if (tag) log.debug(`Tag "${name}" updated in guild ${guildId}`);
    return tag as TagDocument | null;
  }

  /** Delete a tag. Returns true if a tag was deleted. */
  async deleteTag(guildId: string, name: string): Promise<boolean> {
    const result = await TagModel.deleteOne({ guildId, name: name.toLowerCase() });
    if (result.deletedCount > 0) {
      log.debug(`Tag "${name}" deleted from guild ${guildId}`);
      return true;
    }
    return false;
  }

  // ── Usage tracking ──────────────────────────────────────

  /** Increment the use counter for a tag. Returns the updated tag or null if not found. */
  async incrementUses(guildId: string, name: string): Promise<TagDocument | null> {
    return TagModel.findOneAndUpdate({ guildId, name: name.toLowerCase() }, { $inc: { uses: 1 } }, { new: true }) as Promise<TagDocument | null>;
  }

  // ── Autocomplete ────────────────────────────────────────

  /** Search tags for autocomplete. Returns up to 25 matching tag names. */
  async autocomplete(guildId: string, query: string): Promise<{ name: string; value: string }[]> {
    const filter: Record<string, unknown> = { guildId };
    if (query) {
      filter.name = { $regex: query, $options: "i" };
    }

    const tags = await TagModel.find(filter).sort({ uses: -1, name: 1 }).limit(25).select("name uses").lean();

    return tags.map((t) => ({
      name: `${t.name} (${t.uses} uses)`,
      value: t.name,
    }));
  }
}
