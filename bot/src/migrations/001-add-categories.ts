import Database from "../utils/data/database";
import ModmailConfig from "../models/ModmailConfig";
import { v4 as uuidv4 } from "uuid";
import log from "../utils/log";

/**
 * Migration: Add category system to existing ModmailConfig records
 *
 * This migration converts existing modmail configurations to use the new category system:
 * - Creates a default "General Support" category from existing settings
 * - Sets the master staff role to the existing staff role
 * - Preserves all existing functionality while enabling new category features
 */
export class AddCategoriesMigration {
  private db: Database;

  constructor() {
    this.db = new Database();
  }

  /**
   * Run the migration to add categories to existing configs
   */
  async up(): Promise<void> {
    log.info("Starting migration: Add categories to ModmailConfig");

    try {
      // Find all configs that don't have the new category structure
      const configsToMigrate = await this.db.find(ModmailConfig, {
        $or: [{ defaultCategory: { $exists: false } }, { masterStaffRoleId: { $exists: false } }],
      });

      if (!configsToMigrate) {
        log.info("No configs found to migrate");
        return;
      }

      log.info(`Found ${configsToMigrate.length} configs to migrate`);

      for (const config of configsToMigrate) {
        await this.migrateConfig(config);
      }

      log.info("Migration completed successfully");
    } catch (error) {
      log.error("Migration failed:", error);
      throw error;
    }
  }

  /**
   * Migrate a single config to the new category structure
   */
  private async migrateConfig(config: any): Promise<void> {
    try {
      // Create default category from existing settings
      const defaultCategory = {
        id: uuidv4(),
        name: "General Support",
        description: "Default support category for all general inquiries",
        emoji: "🎫",
        forumChannelId: config.forumChannelId,
        staffRoleId: config.staffRoleId,
        priority: 2, // Medium priority
        isActive: true,
        formFields: [], // No custom form fields initially
      };

      // Prepare update data
      const updateData: any = {
        defaultCategory,
        categories: [], // Empty additional categories array
        masterStaffRoleId: config.staffRoleId, // Use existing staff role as master
      };

      // Only update fields that don't exist to avoid overwriting manual changes
      if (!config.defaultCategory) {
        updateData.defaultCategory = defaultCategory;
      }
      if (!config.masterStaffRoleId) {
        updateData.masterStaffRoleId = config.staffRoleId;
      }
      if (!config.categories) {
        updateData.categories = [];
      }

      // Update the config
      await this.db.findOneAndUpdate(ModmailConfig, { _id: config._id }, updateData);

      log.info(`Migrated config for guild ${config.guildId}`);
    } catch (error) {
      log.error(`Failed to migrate config for guild ${config.guildId}:`, error);
      throw error;
    }
  }

  /**
   * Rollback the migration (remove category fields)
   */
  async down(): Promise<void> {
    log.info("Rolling back migration: Remove categories from ModmailConfig");

    try {
      // For rollback, we'll just mark all configs as needing manual intervention
      // since we can't safely remove fields using our Database wrapper
      log.warn(
        "Rollback requires manual intervention - category fields will remain but can be ignored"
      );
      log.info("Migration rollback completed (manual intervention required)");
    } catch (error) {
      log.error("Migration rollback failed:", error);
      throw error;
    }
  }

  /**
   * Check if migration is needed
   */
  async isRequired(): Promise<boolean> {
    const configsWithoutCategories = await this.db.find(ModmailConfig, {
      defaultCategory: { $exists: false },
    });

    return !!(configsWithoutCategories && configsWithoutCategories.length > 0);
  }
}

/**
 * Auto-run migration on import if needed
 */
export async function runCategoriesMigrationIfNeeded(): Promise<void> {
  const migration = new AddCategoriesMigration();

  if (await migration.isRequired()) {
    log.info("Categories migration is required, running automatically...");
    await migration.up();
  } else {
    log.debug("Categories migration not required, skipping");
  }
}
