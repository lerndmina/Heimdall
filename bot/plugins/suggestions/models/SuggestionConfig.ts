import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";
import { nanoid } from "nanoid";

/** Channel configuration for suggestions */
export interface ChannelConfig {
  channelId: string;
  mode: "embed" | "forum";
  enableAiTitles: boolean;
  createdBy: string;
  createdAt: Date;
}

const ChannelConfigSchema = new Schema<ChannelConfig>(
  {
    channelId: { type: String, required: true },
    mode: { type: String, enum: ["embed", "forum"], required: true },
    enableAiTitles: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/** Category configuration for suggestions */
export interface SuggestionCategory {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  channelId?: string;
  isActive: boolean;
  position: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const SuggestionCategorySchema = new Schema<SuggestionCategory>(
  {
    id: { type: String, default: () => nanoid(8), unique: true },
    name: { type: String, required: true, maxlength: 50 },
    description: { type: String, required: true, maxlength: 200 },
    emoji: { type: String, maxlength: 100 },
    channelId: { type: String },
    isActive: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const SuggestionConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    channels: { type: [ChannelConfigSchema], default: [] },
    categories: { type: [SuggestionCategorySchema], default: [] },
    maxChannels: { type: Number, default: 3, min: 1, max: 10 },
    maxCategories: { type: Number, default: 15, min: 1, max: 25 },
    enableCategories: { type: Boolean, default: false },
    voteCooldown: { type: Number, default: 60, min: 10, max: 300 },
    submissionCooldown: { type: Number, default: 3600, min: 60, max: 7200 },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true },
);

SuggestionConfigSchema.index({ "channels.channelId": 1 });
SuggestionConfigSchema.index({ "categories.id": 1 });
SuggestionConfigSchema.index({ guildId: 1, "categories.position": 1 });

export type ISuggestionConfig = InferSchemaType<typeof SuggestionConfigSchema>;

const SuggestionConfig = (mongoose.models.SuggestionConfig || model<ISuggestionConfig>("SuggestionConfig", SuggestionConfigSchema)) as Model<ISuggestionConfig>;

export default SuggestionConfig;

/** Helper methods for SuggestionConfig */
export class SuggestionConfigHelper {
  static async addChannel(guildId: string, channelId: string, mode: "embed" | "forum", enableAiTitles: boolean, userId: string): Promise<ISuggestionConfig | null> {
    const config = await SuggestionConfig.findOne({ guildId });

    if (!config) {
      return SuggestionConfig.create({
        guildId,
        channels: [{ channelId, mode, enableAiTitles, createdBy: userId, createdAt: new Date() }],
        updatedBy: userId,
      });
    }

    if (config.channels.some((ch) => ch.channelId === channelId)) return null;
    if (config.channels.length >= config.maxChannels) return null;

    config.channels.push({ channelId, mode, enableAiTitles, createdBy: userId, createdAt: new Date() });
    config.updatedBy = userId;
    return config.save();
  }

  static async removeChannel(guildId: string, channelId: string): Promise<boolean> {
    const result = await SuggestionConfig.updateOne({ guildId }, { $pull: { channels: { channelId } } });
    return result.modifiedCount > 0;
  }

  static async getChannelConfig(channelId: string): Promise<ChannelConfig | null> {
    const config = await SuggestionConfig.findOne({ "channels.channelId": channelId });
    if (!config) return null;
    return config.channels.find((ch) => ch.channelId === channelId) || null;
  }

  static async isAtMaxCapacity(guildId: string): Promise<boolean> {
    const config = await SuggestionConfig.findOne({ guildId });
    if (!config) return false;
    return config.channels.length >= config.maxChannels;
  }

  static async getGuildConfig(guildId: string): Promise<ISuggestionConfig | null> {
    return SuggestionConfig.findOne({ guildId });
  }

  // ===== CATEGORY MANAGEMENT =====

  static async addCategory(
    guildId: string,
    name: string,
    description: string,
    emoji: string | undefined,
    channelId: string | undefined,
    userId: string,
  ): Promise<{ success: boolean; category?: SuggestionCategory; error?: string }> {
    const config = await SuggestionConfig.findOne({ guildId });

    if (!config) {
      const newConfig = await SuggestionConfig.create({
        guildId,
        channels: [],
        categories: [{ name, description, emoji, channelId, isActive: true, position: 0, createdBy: userId, createdAt: new Date(), updatedAt: new Date() }],
        enableCategories: true,
        updatedBy: userId,
      });
      return { success: true, category: newConfig.categories[0] as unknown as SuggestionCategory };
    }

    if (config.categories.some((cat) => cat.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, error: "Category name already exists" };
    }

    if (config.categories.length >= config.maxCategories) {
      return { success: false, error: `Maximum ${config.maxCategories} categories allowed` };
    }

    const maxPosition = Math.max(0, ...config.categories.map((cat) => cat.position));

    const newCategory: SuggestionCategory = {
      id: nanoid(8),
      name,
      description,
      emoji,
      channelId,
      isActive: true,
      position: maxPosition + 1,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    config.categories.push(newCategory);
    config.enableCategories = true;
    config.updatedBy = userId;
    await config.save();

    return { success: true, category: newCategory };
  }

  static async updateCategory(
    guildId: string,
    categoryId: string,
    updates: { name?: string; description?: string; emoji?: string; channelId?: string; isActive?: boolean },
    userId: string,
  ): Promise<{ success: boolean; category?: SuggestionCategory; error?: string }> {
    const config = await SuggestionConfig.findOne({ guildId });
    if (!config) return { success: false, error: "Configuration not found" };

    const categoryIndex = config.categories.findIndex((cat) => cat.id === categoryId);
    if (categoryIndex === -1) return { success: false, error: "Category not found" };

    if (updates.name) {
      const existing = config.categories.find((cat) => cat.id !== categoryId && cat.name.toLowerCase() === updates.name!.toLowerCase());
      if (existing) return { success: false, error: "Category name already exists" };
    }

    const category = config.categories[categoryIndex]!;
    if (updates.name !== undefined) category.name = updates.name;
    if (updates.description !== undefined) category.description = updates.description;
    if (updates.emoji !== undefined) category.emoji = updates.emoji;
    if (updates.channelId !== undefined) category.channelId = updates.channelId;
    if (updates.isActive !== undefined) category.isActive = updates.isActive;
    category.updatedAt = new Date();

    config.updatedBy = userId;
    await config.save();

    return { success: true, category: category as unknown as SuggestionCategory };
  }

  static async removeCategory(guildId: string, categoryId: string): Promise<{ success: boolean; error?: string }> {
    const result = await SuggestionConfig.updateOne({ guildId }, { $pull: { categories: { id: categoryId } } });
    return result.modifiedCount > 0 ? { success: true } : { success: false, error: "Category not found" };
  }

  static async reorderCategories(guildId: string, categoryIds: string[], userId: string): Promise<{ success: boolean; error?: string }> {
    const config = await SuggestionConfig.findOne({ guildId });
    if (!config) return { success: false, error: "Configuration not found" };

    const existingIds = config.categories.map((cat) => cat.id);
    const invalidIds = categoryIds.filter((id) => !existingIds.includes(id));
    if (invalidIds.length > 0) return { success: false, error: `Invalid category IDs: ${invalidIds.join(", ")}` };

    categoryIds.forEach((categoryId, index) => {
      const category = config.categories.find((cat) => cat.id === categoryId);
      if (category) {
        category.position = index;
        category.updatedAt = new Date();
      }
    });

    config.updatedBy = userId;
    await config.save();
    return { success: true };
  }

  static async getActiveCategories(guildId: string, channelId?: string): Promise<SuggestionCategory[]> {
    const config = await SuggestionConfig.findOne({ guildId });
    if (!config || !config.enableCategories) return [];

    let categories = config.categories.filter((cat) => cat.isActive) as unknown as SuggestionCategory[];
    if (channelId) categories = categories.filter((cat) => !cat.channelId || cat.channelId === channelId);
    return categories.sort((a, b) => a.position - b.position);
  }

  static async getAllCategories(guildId: string): Promise<SuggestionCategory[]> {
    const config = await SuggestionConfig.findOne({ guildId });
    if (!config) return [];
    return (config.categories as unknown as SuggestionCategory[]).sort((a, b) => a.position - b.position);
  }

  static async getCategory(guildId: string, categoryId: string): Promise<SuggestionCategory | null> {
    const config = await SuggestionConfig.findOne({ guildId });
    if (!config) return null;
    return (config.categories.find((cat) => cat.id === categoryId) as unknown as SuggestionCategory) || null;
  }

  static async toggleCategories(guildId: string, enabled: boolean, userId: string): Promise<{ success: boolean; error?: string }> {
    const config = await SuggestionConfig.findOne({ guildId });
    if (!config) {
      await SuggestionConfig.create({ guildId, channels: [], categories: [], enableCategories: enabled, updatedBy: userId });
      return { success: true };
    }
    config.enableCategories = enabled;
    config.updatedBy = userId;
    await config.save();
    return { success: true };
  }
}
