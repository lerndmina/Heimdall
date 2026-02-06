/**
 * ModmailCategoryService - CRUD operations for modmail categories
 *
 * Handles category creation, updates, deletion, and form field management.
 */

import { ChannelType, type Guild, type ForumChannel } from "discord.js";
import type { ModmailService } from "./ModmailService.js";
import ModmailConfig, { type IModmailConfig, type ModmailCategory, type FormField, ModmailFormFieldType } from "../models/ModmailConfig.js";
import { nanoid } from "nanoid";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import { createForumTags } from "../utils/forumTagHelper.js";

/**
 * Data required to create a new category
 */
export interface CreateCategoryData {
  name: string;
  description?: string;
  emoji?: string;
  forumChannelId: string;
  staffRoleIds?: string[];
  priority?: 1 | 2 | 3 | 4;
  formFields?: FormField[];
  autoCloseHours?: number;
  resolveAutoCloseHours?: number;
}

/**
 * Data for updating an existing category
 */
export interface UpdateCategoryData {
  name?: string;
  description?: string;
  emoji?: string;
  staffRoleIds?: string[];
  priority?: 1 | 2 | 3 | 4;
  autoCloseHours?: number;
  resolveAutoCloseHours?: number;
  enabled?: boolean;
}

/**
 * ModmailCategoryService - Category CRUD operations
 */
export class ModmailCategoryService {
  constructor(
    private modmailService: ModmailService,
    private encryptionKey: string,
    private logger: PluginLogger,
  ) {}

  /**
   * Fetch config as a Mongoose document (bypasses cache).
   * Required for any mutation that calls .save().
   */
  private async getConfigDocument(guildId: string): Promise<(IModmailConfig & import("mongoose").Document) | null> {
    return ModmailConfig.findOne({ guildId });
  }

  /**
   * Create a new modmail category
   */
  async createCategory(guildId: string, data: CreateCategoryData): Promise<ModmailCategory | null> {
    try {
      const config = await this.getConfigDocument(guildId);
      if (!config) {
        this.logger.error(`No modmail config found for guild ${guildId}`);
        return null;
      }

      // Generate category ID
      const categoryId = nanoid(12);

      // Fetch guild and forum channel
      const guild = await this.modmailService.client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(data.forumChannelId);

      if (!channel || channel.type !== ChannelType.GuildForum) {
        // 15 = GuildForum
        this.logger.error(`Channel ${data.forumChannelId} is not a forum channel`);
        return null;
      }

      const forumChannel = channel as ForumChannel;

      // Create webhook for this category
      const webhookData = await this.modmailService.createWebhook(guild, forumChannel);
      if (!webhookData) {
        this.logger.error("Failed to create webhook for category");
        return null;
      }

      // Encrypt webhook token
      const encryptedToken = ModmailConfig.encryptWebhookToken(webhookData.webhookToken, this.encryptionKey);

      // Create forum tags (Open/Closed) on this category's forum channel
      const forumTags = await createForumTags(forumChannel);

      const category: ModmailCategory = {
        id: categoryId,
        name: data.name,
        description: data.description,
        emoji: data.emoji,
        forumChannelId: data.forumChannelId,
        webhookId: webhookData.webhookId,
        encryptedWebhookToken: encryptedToken,
        staffRoleIds: data.staffRoleIds || [],
        priority: data.priority || 2,
        formFields: data.formFields || [],
        autoCloseHours: data.autoCloseHours,
        resolveAutoCloseHours: data.resolveAutoCloseHours || 24,
        enabled: true,
        openTagId: forumTags?.openTagId,
        closedTagId: forumTags?.closedTagId,
      };

      // Add to config
      (config.categories as ModmailCategory[]).push(category);

      // Set as default if first category
      if ((config.categories as ModmailCategory[]).length === 1) {
        config.defaultCategoryId = categoryId;
      }

      await config.save();
      await this.modmailService.invalidateConfigCache(guildId);

      this.logger.info(`Created modmail category ${categoryId} in guild ${guildId}`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to create category in guild ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Update an existing category
   */
  async updateCategory(guildId: string, categoryId: string, data: UpdateCategoryData): Promise<ModmailCategory | null> {
    try {
      const config = await this.getConfigDocument(guildId);
      if (!config) {
        this.logger.error(`No modmail config found for guild ${guildId}`);
        return null;
      }

      const categories = config.categories as ModmailCategory[];
      const categoryIndex = categories.findIndex((c) => c.id === categoryId);

      if (categoryIndex === -1) {
        this.logger.error(`Category ${categoryId} not found in guild ${guildId}`);
        return null;
      }

      // Get category with non-null assertion (we checked index above)
      const category = categories[categoryIndex]!;

      // Update fields
      if (data.name !== undefined) category.name = data.name;
      if (data.description !== undefined) category.description = data.description;
      if (data.emoji !== undefined) category.emoji = data.emoji;
      if (data.staffRoleIds !== undefined) category.staffRoleIds = data.staffRoleIds;
      if (data.priority !== undefined) category.priority = data.priority;
      if (data.autoCloseHours !== undefined) category.autoCloseHours = data.autoCloseHours;
      if (data.resolveAutoCloseHours !== undefined) category.resolveAutoCloseHours = data.resolveAutoCloseHours;
      if (data.enabled !== undefined) category.enabled = data.enabled;

      await config.save();
      await this.modmailService.invalidateConfigCache(guildId);

      this.logger.info(`Updated modmail category ${categoryId} in guild ${guildId}`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to update category ${categoryId}:`, error);
      return null;
    }
  }

  /**
   * Delete a category
   */
  async deleteCategory(guildId: string, categoryId: string): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.getConfigDocument(guildId);
      if (!config) {
        return { success: false, message: "No modmail config found" };
      }

      const categories = config.categories as ModmailCategory[];
      const categoryIndex = categories.findIndex((c) => c.id === categoryId);

      if (categoryIndex === -1) {
        return { success: false, message: "Category not found" };
      }

      // Don't allow deleting the last category
      if (categories.length === 1) {
        return { success: false, message: "Cannot delete the last category" };
      }

      // Remove the category
      categories.splice(categoryIndex, 1);

      // Update default if we deleted the default category
      if (config.defaultCategoryId === categoryId) {
        config.defaultCategoryId = categories[0]?.id;
      }

      await config.save();
      await this.modmailService.invalidateConfigCache(guildId);

      this.logger.info(`Deleted modmail category ${categoryId} from guild ${guildId}`);
      return { success: true, message: "Category deleted" };
    } catch (error) {
      this.logger.error(`Failed to delete category ${categoryId}:`, error);
      return { success: false, message: "Delete failed" };
    }
  }

  /**
   * List all categories for a guild
   */
  async listCategories(guildId: string): Promise<ModmailCategory[]> {
    try {
      const config = await this.modmailService.getConfig(guildId);
      if (!config) {
        return [];
      }

      return config.categories as ModmailCategory[];
    } catch (error) {
      this.logger.error(`Failed to list categories for guild ${guildId}:`, error);
      return [];
    }
  }

  /**
   * Get a single category by ID
   */
  async getCategory(guildId: string, categoryId: string): Promise<ModmailCategory | null> {
    try {
      const config = await this.modmailService.getConfig(guildId);
      if (!config) {
        return null;
      }

      return (config.categories as ModmailCategory[]).find((c) => c.id === categoryId) || null;
    } catch (error) {
      this.logger.error(`Failed to get category ${categoryId}:`, error);
      return null;
    }
  }

  /**
   * Set the default category for a guild
   */
  async setDefaultCategory(guildId: string, categoryId: string): Promise<boolean> {
    try {
      const config = await this.getConfigDocument(guildId);
      if (!config) {
        this.logger.error(`No modmail config found for guild ${guildId}`);
        return false;
      }

      const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!category) {
        this.logger.error(`Category ${categoryId} not found in guild ${guildId}`);
        return false;
      }

      config.defaultCategoryId = categoryId;
      await config.save();
      await this.modmailService.invalidateConfigCache(guildId);

      this.logger.info(`Set default category to ${categoryId} in guild ${guildId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to set default category:`, error);
      return false;
    }
  }

  /**
   * Validate category data
   */
  validateCategory(category: Partial<CreateCategoryData>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!category.name || category.name.length < 1) {
      errors.push("Category name is required");
    }

    if (category.name && category.name.length > 50) {
      errors.push("Category name must be 50 characters or less");
    }

    if (category.description && category.description.length > 100) {
      errors.push("Category description must be 100 characters or less");
    }

    if (!category.forumChannelId) {
      errors.push("Forum channel ID is required");
    }

    if (category.priority && (category.priority < 1 || category.priority > 4)) {
      errors.push("Priority must be between 1 and 4");
    }

    if (category.formFields && category.formFields.length > 5) {
      errors.push("Maximum 5 form fields allowed per Discord modal limit");
    }

    return { valid: errors.length === 0, errors };
  }

  // ========================================
  // FORM FIELD MANAGEMENT
  // ========================================

  /**
   * Add a form field to a category
   */
  async addFormField(guildId: string, categoryId: string, field: Omit<FormField, "id">): Promise<FormField | null> {
    try {
      const config = await this.getConfigDocument(guildId);
      if (!config) {
        this.logger.error(`No modmail config found for guild ${guildId}`);
        return null;
      }

      const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!category) {
        this.logger.error(`Category ${categoryId} not found`);
        return null;
      }

      // Check form field limit (Discord modal limit is 5)
      if (category.formFields.length >= 5) {
        this.logger.error("Maximum 5 form fields allowed per category");
        return null;
      }

      const formField: FormField = {
        id: nanoid(12),
        ...field,
      };

      category.formFields.push(formField);

      await config.save();
      await this.modmailService.invalidateConfigCache(guildId);

      this.logger.info(`Added form field ${formField.id} to category ${categoryId}`);
      return formField;
    } catch (error) {
      this.logger.error(`Failed to add form field to category ${categoryId}:`, error);
      return null;
    }
  }

  /**
   * Update a form field in a category
   */
  async updateFormField(guildId: string, categoryId: string, fieldId: string, data: Partial<Omit<FormField, "id">>): Promise<FormField | null> {
    try {
      const config = await this.getConfigDocument(guildId);
      if (!config) {
        this.logger.error(`No modmail config found for guild ${guildId}`);
        return null;
      }

      const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!category) {
        this.logger.error(`Category ${categoryId} not found`);
        return null;
      }

      const field = category.formFields.find((f) => f.id === fieldId);
      if (!field) {
        this.logger.error(`Form field ${fieldId} not found`);
        return null;
      }

      // Update fields
      if (data.label !== undefined) field.label = data.label;
      if (data.type !== undefined) field.type = data.type;
      if (data.required !== undefined) field.required = data.required;
      if (data.placeholder !== undefined) field.placeholder = data.placeholder;
      if (data.minLength !== undefined) field.minLength = data.minLength;
      if (data.maxLength !== undefined) field.maxLength = data.maxLength;
      if (data.options !== undefined) field.options = data.options;
      if (data.minValue !== undefined) field.minValue = data.minValue;
      if (data.maxValue !== undefined) field.maxValue = data.maxValue;

      await config.save();
      await this.modmailService.invalidateConfigCache(guildId);

      this.logger.info(`Updated form field ${fieldId} in category ${categoryId}`);
      return field;
    } catch (error) {
      this.logger.error(`Failed to update form field ${fieldId}:`, error);
      return null;
    }
  }

  /**
   * Remove a form field from a category
   */
  async removeFormField(guildId: string, categoryId: string, fieldId: string): Promise<boolean> {
    try {
      const config = await this.getConfigDocument(guildId);
      if (!config) {
        this.logger.error(`No modmail config found for guild ${guildId}`);
        return false;
      }

      const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!category) {
        this.logger.error(`Category ${categoryId} not found`);
        return false;
      }

      const fieldIndex = category.formFields.findIndex((f) => f.id === fieldId);
      if (fieldIndex === -1) {
        this.logger.error(`Form field ${fieldId} not found`);
        return false;
      }

      category.formFields.splice(fieldIndex, 1);

      await config.save();
      await this.modmailService.invalidateConfigCache(guildId);

      this.logger.info(`Removed form field ${fieldId} from category ${categoryId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to remove form field ${fieldId}:`, error);
      return false;
    }
  }

  /**
   * Reorder form fields in a category
   */
  async reorderFormFields(guildId: string, categoryId: string, fieldIds: string[]): Promise<boolean> {
    try {
      const config = await this.getConfigDocument(guildId);
      if (!config) {
        this.logger.error(`No modmail config found for guild ${guildId}`);
        return false;
      }

      const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!category) {
        this.logger.error(`Category ${categoryId} not found`);
        return false;
      }

      // Validate all field IDs exist
      const existingIds = new Set(category.formFields.map((f) => f.id));
      for (const fieldId of fieldIds) {
        if (!existingIds.has(fieldId)) {
          this.logger.error(`Form field ${fieldId} not found in category`);
          return false;
        }
      }

      // Create a map for quick lookup
      const fieldMap = new Map(category.formFields.map((f) => [f.id, f]));

      // Reorder based on provided IDs
      category.formFields = fieldIds.map((id) => fieldMap.get(id)!);

      await config.save();
      await this.modmailService.invalidateConfigCache(guildId);

      this.logger.info(`Reordered form fields in category ${categoryId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to reorder form fields:`, error);
      return false;
    }
  }
}
