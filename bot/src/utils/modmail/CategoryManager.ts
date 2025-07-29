import { Guild } from "discord.js";
import Database from "../data/database";
import ModmailConfig, {
  CategoryType,
  ModmailConfigType,
  TicketPriority,
} from "../../models/ModmailConfig";
import Modmail from "../../models/Modmail";
import { v4 as uuidv4 } from "uuid";
import log from "../log";
import { tryCatch } from "../trycatch";

/**
 * Manages ticket categories for modmail system
 * Provides utilities for category creation, validation, and management
 */
export class CategoryManager {
  private db: Database;

  constructor() {
    this.db = new Database();
  }

  /**
   * Convert default category to full CategoryType by adding inherited properties
   * @param defaultCategory - The default category from config
   * @param config - The main modmail config
   * @returns Full CategoryType with inherited properties
   */
  private convertDefaultCategoryToFull(
    defaultCategory: any,
    config: ModmailConfigType
  ): CategoryType {
    return {
      id: defaultCategory.id,
      name: defaultCategory.name,
      description: defaultCategory.description,
      forumChannelId: config.forumChannelId,
      staffRoleId: config.staffRoleId,
      priority: defaultCategory.priority,
      emoji: defaultCategory.emoji,
      isActive: defaultCategory.isActive,
      formFields: defaultCategory.formFields || [],
    };
  }

  /**
   * Get all available and active categories for a guild
   * @param guildId - The guild ID to get categories for
   * @returns Array of active categories including default category
   */
  async getAvailableCategories(guildId: string): Promise<CategoryType[]> {
    const { data: config, error } = await tryCatch(
      this.db.findOne(ModmailConfig, { guildId }, true)
    );

    if (error) {
      log.error(`Failed to fetch categories for guild ${guildId}:`, error);
      return [];
    }

    if (!config) {
      log.warn(`No modmail config found for guild ${guildId}`);
      return [];
    }

    const categories: CategoryType[] = [];

    // Always include default category if it exists and is active
    if (config.defaultCategory && config.defaultCategory.isActive) {
      // Convert default category to full CategoryType by adding inherited properties
      const fullDefaultCategory = this.convertDefaultCategoryToFull(config.defaultCategory, config);
      categories.push(fullDefaultCategory);
    }

    // Add additional active categories
    if (config.categories) {
      const activeCategories = config.categories.filter((cat) => cat.isActive);
      categories.push(...activeCategories);
    }

    return categories;
  }

  /**
   * Get a specific category by ID
   * @param guildId - The guild ID
   * @param categoryId - The category ID to find
   * @returns The category if found, null otherwise
   */
  async getCategoryById(guildId: string, categoryId: string): Promise<CategoryType | null> {
    const categories = await this.getAvailableCategories(guildId);
    return categories.find((cat) => cat.id === categoryId) || null;
  }

  /**
   * Get the default category for a guild
   * @param guildId - The guild ID
   * @returns The default category if configured, null otherwise
   */
  async getDefaultCategory(guildId: string): Promise<CategoryType | null> {
    const { data: config, error } = await tryCatch(
      this.db.findOne(ModmailConfig, { guildId }, true)
    );

    if (error || !config?.defaultCategory) {
      return null;
    }

    return this.convertDefaultCategoryToFull(config.defaultCategory, config);
  }

  /**
   * Check if a user has access to a specific category
   * Currently returns true for all users, but can be extended for role-based access
   * @param category - The category to check access for
   * @param userId - The user ID
   * @returns True if user has access, false otherwise
   */
  async validateCategoryAccess(category: CategoryType, userId: string): Promise<boolean> {
    // For now, all users have access to all categories
    // This can be extended later to include role-based restrictions
    return category.isActive;
  }

  /**
   * Get the next ticket number for a guild using atomic counter
   * @param guildId - The guild ID
   * @returns The next available ticket number
   */
  async getNextTicketNumber(guildId: string): Promise<number> {
    try {
      // First, try to increment the counter
      const { data: updatedConfig, error } = await tryCatch(
        this.db.findOneAndUpdate(
          ModmailConfig,
          { guildId },
          { $inc: { nextTicketNumber: 1 } },
          { upsert: true, new: true }
        )
      );

      if (error) {
        log.error(`Failed to increment ticket counter for guild ${guildId}:`, error);
        return 1; // Fallback to 1 if increment fails
      }

      // If this is the first time (counter was 0 + 1 = 1), we might need to initialize
      // based on existing tickets for backward compatibility
      if (updatedConfig?.nextTicketNumber === 1) {
        // Check if there are existing tickets with higher numbers using direct Mongoose query
        const { data: maxTicket, error: ticketsError } = await tryCatch(
          Modmail.findOne({ guildId, ticketNumber: { $exists: true, $gt: 0 } })
            .sort({ ticketNumber: -1 })
            .limit(1)
            .exec()
        );

        if (!ticketsError && maxTicket && maxTicket.ticketNumber && maxTicket.ticketNumber > 0) {
          // There are existing tickets with higher numbers, initialize properly
          const { error: reinitError } = await tryCatch(
            this.db.findOneAndUpdate(
              ModmailConfig,
              { guildId },
              { nextTicketNumber: maxTicket.ticketNumber + 1 },
              { upsert: true, new: true }
            )
          );

          if (!reinitError) {
            log.info(
              `Auto-initialized ticket counter for guild ${guildId} to ${
                maxTicket.ticketNumber + 1
              }`
            );
            return maxTicket.ticketNumber + 1;
          }
        }
      }

      // Return the incremented value
      return updatedConfig?.nextTicketNumber || 1;
    } catch (error) {
      log.error(`Error getting next ticket number for guild ${guildId}:`, error);
      return 1; // Fallback to 1 on any error
    }
  }

  /**
   * Initialize the ticket counter for a guild based on existing tickets
   * This should only be called once for existing guilds that don't have a counter set
   * @param guildId - The guild ID
   * @returns True if successful, false otherwise
   */
  async initializeTicketCounter(guildId: string): Promise<boolean> {
    try {
      // Check if counter is already initialized (> 0)
      const { data: config, error: fetchError } = await tryCatch(
        this.db.findOne(ModmailConfig, { guildId })
      );

      if (fetchError) {
        log.error(
          `Failed to fetch config for counter initialization in guild ${guildId}:`,
          fetchError
        );
        return false;
      }

      // If counter is already set and > 0, don't reinitialize
      if (config?.nextTicketNumber && config.nextTicketNumber > 0) {
        log.debug(`Ticket counter already initialized for guild ${guildId}`);
        return true;
      }

      // Find the highest existing ticket number using direct Mongoose query for efficiency
      const { data: maxTicket, error: ticketsError } = await tryCatch(
        Modmail.findOne({ guildId, ticketNumber: { $exists: true, $ne: null } })
          .sort({ ticketNumber: -1 })
          .limit(1)
          .exec()
      );

      if (ticketsError) {
        log.error(
          `Failed to fetch tickets for counter initialization in guild ${guildId}:`,
          ticketsError
        );
        return false;
      }

      let maxTicketNumber = 0;
      if (maxTicket && maxTicket.ticketNumber) {
        maxTicketNumber = maxTicket.ticketNumber;
      }

      // Set the counter to the max + 1 (or 0 if no tickets exist)
      const { error: updateError } = await tryCatch(
        this.db.findOneAndUpdate(
          ModmailConfig,
          { guildId },
          { nextTicketNumber: maxTicketNumber },
          { upsert: true, new: true }
        )
      );

      if (updateError) {
        log.error(`Failed to initialize ticket counter for guild ${guildId}:`, updateError);
        return false;
      }

      log.info(`Initialized ticket counter for guild ${guildId} to ${maxTicketNumber}`);
      return true;
    } catch (error) {
      log.error(`Error initializing ticket counter for guild ${guildId}:`, error);
      return false;
    }
  }

  /**
   * Create a new category for a guild
   * @param guildId - The guild ID
   * @param categoryData - The category data
   * @returns The created category or null if failed
   */
  async createCategory(
    guildId: string,
    categoryData: Omit<CategoryType, "id">
  ): Promise<CategoryType | null> {
    const { data: config, error: fetchError } = await tryCatch(
      this.db.findOne(ModmailConfig, { guildId })
    );

    if (fetchError || !config) {
      log.error(`Failed to fetch config for category creation in guild ${guildId}:`, fetchError);
      return null;
    }

    const newCategory: CategoryType = {
      id: uuidv4(),
      ...categoryData,
    };

    // Add to categories array
    const updatedCategories = [...(config.categories || []), newCategory];

    const { error: updateError } = await tryCatch(
      this.db.findOneAndUpdate(ModmailConfig, { guildId }, { categories: updatedCategories })
    );

    if (updateError) {
      log.error(`Failed to create category in guild ${guildId}:`, updateError);
      return null;
    }

    log.info(`Created new category "${newCategory.name}" (${newCategory.id}) in guild ${guildId}`);
    return newCategory;
  }

  /**
   * Update an existing category
   * @param guildId - The guild ID
   * @param categoryId - The category ID to update
   * @param updates - The updates to apply
   * @returns True if successful, false otherwise
   */
  async updateCategory(
    guildId: string,
    categoryId: string,
    updates: Partial<Omit<CategoryType, "id">>
  ): Promise<boolean> {
    const { data: config, error: fetchError } = await tryCatch(
      this.db.findOne(ModmailConfig, { guildId })
    );

    if (fetchError || !config) {
      log.error(`Failed to fetch config for category update in guild ${guildId}:`, fetchError);
      return false;
    }

    // Check if updating default category
    if (config.defaultCategory?.id === categoryId) {
      const updatedDefaultCategory = { ...config.defaultCategory, ...updates };

      const { error: updateError } = await tryCatch(
        this.db.findOneAndUpdate(
          ModmailConfig,
          { guildId },
          { defaultCategory: updatedDefaultCategory }
        )
      );

      if (updateError) {
        log.error(`Failed to update default category in guild ${guildId}:`, updateError);
        return false;
      }

      log.info(`Updated default category (${categoryId}) in guild ${guildId}`);
      return true;
    }

    // Update in categories array
    const categoryIndex = config.categories?.findIndex((cat) => cat.id === categoryId) ?? -1;

    if (categoryIndex === -1) {
      log.warn(`Category ${categoryId} not found in guild ${guildId}`);
      return false;
    }

    const updatedCategories = [...(config.categories || [])];
    // Create a new category object instead of modifying the existing one
    updatedCategories[categoryIndex] = {
      ...JSON.parse(JSON.stringify(updatedCategories[categoryIndex])),
      ...updates,
    };

    const { error: updateError } = await tryCatch(
      this.db.findOneAndUpdate(ModmailConfig, { guildId }, { categories: updatedCategories })
    );

    if (updateError) {
      log.error(`Failed to update category ${categoryId} in guild ${guildId}:`, updateError);
      return false;
    }

    log.info(`Updated category "${updates.name || "Unknown"}" (${categoryId}) in guild ${guildId}`);
    return true;
  }

  /**
   * Delete a category (sets isActive to false)
   * @param guildId - The guild ID
   * @param categoryId - The category ID to delete
   * @returns True if successful, false otherwise
   */
  async deleteCategory(guildId: string, categoryId: string): Promise<boolean> {
    // Don't allow deleting the default category
    const defaultCategory = await this.getDefaultCategory(guildId);
    if (defaultCategory?.id === categoryId) {
      log.warn(`Attempted to delete default category ${categoryId} in guild ${guildId}`);
      return false;
    }

    return await this.updateCategory(guildId, categoryId, { isActive: false });
  }

  /**
   * Get category statistics for a guild
   * @param guildId - The guild ID
   * @returns Statistics about category usage
   */
  async getCategoryStats(
    guildId: string
  ): Promise<Record<string, { name: string; count: number; priority: TicketPriority }>> {
    const categories = await this.getAvailableCategories(guildId);
    const stats: Record<string, { name: string; count: number; priority: TicketPriority }> = {};

    for (const category of categories) {
      // Get all tickets for this category
      const { data: tickets, error } = await tryCatch(
        this.db.find(Modmail, { guildId, categoryId: category.id })
      );

      stats[category.id] = {
        name: category.name,
        count: error || !tickets ? 0 : tickets.length,
        priority: category.priority as TicketPriority,
      };
    }

    return stats;
  }

  /**
   * Validate category configuration
   * @param category - The category to validate
   * @param fallbackStaffRoleId - Fallback staff role ID from main config
   * @returns Validation result with any errors
   */
  validateCategory(
    category: Partial<CategoryType>,
    fallbackStaffRoleId?: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!category.name || category.name.trim().length === 0) {
      errors.push("Category name is required");
    }

    if (category.name && category.name.length > 50) {
      errors.push("Category name must be 50 characters or less");
    }

    if (!category.forumChannelId) {
      errors.push("Forum channel ID is required");
    }

    // Staff role validation - either category has its own or fallback is available
    const effectiveStaffRoleId = category.staffRoleId || fallbackStaffRoleId;
    if (!effectiveStaffRoleId) {
      errors.push("Staff role ID is required (either for category or main config)");
    }

    if (category.description && category.description.length > 200) {
      errors.push("Category description must be 200 characters or less");
    }

    if (category.formFields && category.formFields.length > 5) {
      errors.push("Maximum 5 form fields allowed per category");
    }

    if (category.priority && !Object.values(TicketPriority).includes(category.priority)) {
      errors.push("Invalid priority level");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get the effective staff role ID for a category (category's own or fallback to main config)
   * @param category - The category to get staff role for
   * @param mainConfigStaffRoleId - Staff role ID from main config
   * @returns The effective staff role ID
   */
  static getEffectiveStaffRoleId(category: CategoryType, mainConfigStaffRoleId: string): string {
    return category.staffRoleId || mainConfigStaffRoleId;
  }
}

// Export singleton instance
export default new CategoryManager();
