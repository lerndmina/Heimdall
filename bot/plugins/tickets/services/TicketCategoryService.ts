/**
 * TicketCategoryService - CRUD operations for ticket categories
 */

import type { PluginLogger } from "../../../src/types/Plugin.js";
import TicketCategory, { type ITicketCategory } from "../models/TicketCategory.js";
import Ticket from "../models/Ticket.js";
import { TicketStatus, CategoryType } from "../types/index.js";

export class TicketCategoryService {
  constructor(private logger: PluginLogger) {}

  /**
   * Create a new ticket category
   */
  async createCategory(guildId: string, data: Partial<ITicketCategory>): Promise<ITicketCategory | null> {
    try {
      const category = new TicketCategory({
        ...data,
        guildId,
      });

      await category.save();
      this.logger.info(`Created ticket category ${category.id} in guild ${guildId}`);
      return category;
    } catch (error) {
      this.logger.error(`Failed to create category in guild ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Update an existing ticket category
   * Note: discordCategoryId is immutable
   */
  async updateCategory(categoryId: string, updates: Partial<ITicketCategory>): Promise<boolean> {
    try {
      // Remove immutable fields
      const { id, guildId, discordCategoryId, createdBy, ...allowedUpdates } = updates as Record<string, unknown>;

      if (Object.keys(allowedUpdates).length === 0) {
        return false;
      }

      const result = await TicketCategory.updateOne({ id: categoryId }, { $set: { ...allowedUpdates, updatedAt: new Date() } });

      if (result.modifiedCount > 0) {
        this.logger.info(`Updated ticket category ${categoryId}`);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to update category ${categoryId}:`, error);
      return false;
    }
  }

  /**
   * Delete a ticket category
   * Validates no active tickets exist
   */
  async deleteCategory(categoryId: string): Promise<{ success: boolean; message: string }> {
    try {
      const category = await TicketCategory.findOne({ id: categoryId });
      if (!category) {
        return { success: false, message: "Category not found" };
      }

      // Check for active tickets
      const activeTickets = await Ticket.countDocuments({
        categoryId,
        status: { $in: [TicketStatus.OPEN, TicketStatus.CLAIMED] },
      });

      if (activeTickets > 0) {
        return { success: false, message: `Cannot delete: ${activeTickets} active tickets exist` };
      }

      // Remove from parent if child
      if (category.type === CategoryType.CHILD && category.parentId) {
        await TicketCategory.updateOne({ id: category.parentId }, { $pull: { childIds: categoryId } });
      }

      await TicketCategory.deleteOne({ id: categoryId });
      this.logger.info(`Deleted ticket category ${categoryId}`);
      return { success: true, message: "Category deleted" };
    } catch (error) {
      this.logger.error(`Failed to delete category ${categoryId}:`, error);
      return { success: false, message: "Delete failed" };
    }
  }

  /**
   * Get a category by ID
   */
  async getCategory(categoryId: string): Promise<ITicketCategory | null> {
    return TicketCategory.findOne({ id: categoryId });
  }

  /**
   * Get all categories for a guild
   */
  async getGuildCategories(guildId: string, type?: CategoryType): Promise<ITicketCategory[]> {
    const query: Record<string, unknown> = { guildId, isActive: true };
    if (type) query.type = type;
    return TicketCategory.find(query).sort({ name: 1 });
  }

  /**
   * Validate category hierarchy
   */
  async validateCategoryHierarchy(categoryId: string): Promise<boolean> {
    const category = await TicketCategory.findOne({ id: categoryId });
    if (!category) return false;

    if (category.type === CategoryType.CHILD && category.parentId) {
      const parent = await TicketCategory.findOne({ id: category.parentId });
      if (!parent || parent.type !== CategoryType.PARENT) {
        this.logger.error(`Child category ${categoryId} has invalid parent`);
        return false;
      }
    }
    return true;
  }
}
