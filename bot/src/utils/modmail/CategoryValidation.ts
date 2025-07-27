import {
  CategoryType,
  FormFieldType,
  FormFieldSchema,
  TicketPriority,
} from "../../models/ModmailConfig";
import { Client, Guild, ForumChannel, Role } from "discord.js";
import { ThingGetter } from "../TinyUtils";
import log from "../log";
import { tryCatch } from "../trycatch";

/**
 * Validation utilities for ticket categories and form fields
 */
export class CategoryValidation {
  /**
   * Validate a category configuration
   * @param category - The category to validate
   * @param guild - Optional guild to validate against Discord entities
   * @param client - Optional Discord client for entity validation
   * @param fallbackStaffRoleId - Fallback staff role ID from main config (for optional category staff roles)
   * @returns Validation result with errors
   */
  static async validateCategory(
    category: Partial<CategoryType>,
    guild?: Guild,
    client?: Client,
    fallbackStaffRoleId?: string
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic field validation
    if (!category.name || category.name.trim().length === 0) {
      errors.push("Category name is required");
    } else if (category.name.length > 50) {
      errors.push("Category name must be 50 characters or less");
    }

    if (category.description && category.description.length > 200) {
      errors.push("Category description must be 200 characters or less");
    }

    if (!category.forumChannelId) {
      errors.push("Forum channel ID is required");
    }

    // Staff role validation - either category has its own or fallback is available
    const effectiveStaffRoleId = category.staffRoleId || fallbackStaffRoleId;
    if (!effectiveStaffRoleId) {
      errors.push("Staff role ID is required (either for category or main config)");
    }

    if (category.priority && !Object.values(TicketPriority).includes(category.priority)) {
      errors.push("Invalid priority level");
    }

    if (category.emoji && category.emoji.length > 10) {
      errors.push("Emoji field must be 10 characters or less");
    }

    // Form fields validation
    if (category.formFields) {
      if (category.formFields.length > 5) {
        errors.push("Maximum 5 form fields allowed per category");
      }

      category.formFields.forEach((field, index) => {
        const fieldErrors = this.validateFormField(field);
        fieldErrors.forEach((error) => {
          errors.push(`Form field ${index + 1}: ${error}`);
        });
      });
    }

    // Discord entity validation (if guild and client provided)
    if (guild && client && category.forumChannelId && effectiveStaffRoleId) {
      const discordValidation = await this.validateDiscordEntities(
        category.forumChannelId,
        effectiveStaffRoleId,
        guild,
        client
      );

      errors.push(...discordValidation.errors);
      warnings.push(...discordValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single form field
   * @param field - The form field to validate
   * @returns Array of validation errors
   */
  static validateFormField(field: Partial<FormFieldSchema>): string[] {
    const errors: string[] = [];

    if (!field.id || field.id.trim().length === 0) {
      errors.push("Field ID is required");
    }

    if (!field.label || field.label.trim().length === 0) {
      errors.push("Field label is required");
    } else if (field.label.length > 100) {
      errors.push("Field label must be 100 characters or less");
    }

    if (!field.type || !Object.values(FormFieldType).includes(field.type as FormFieldType)) {
      errors.push("Valid field type is required");
    }

    if (field.placeholder && field.placeholder.length > 100) {
      errors.push("Field placeholder must be 100 characters or less");
    }

    if (field.maxLength && (field.maxLength < 1 || field.maxLength > 4000)) {
      errors.push("Max length must be between 1 and 4000 characters");
    }

    if (field.minLength && (field.minLength < 0 || field.minLength > 4000)) {
      errors.push("Min length must be between 0 and 4000 characters");
    }

    if (field.minLength && field.maxLength && field.minLength > field.maxLength) {
      errors.push("Min length cannot be greater than max length");
    }

    // Select field specific validation
    if (field.type === FormFieldType.SELECT) {
      if (!field.options || field.options.length === 0) {
        errors.push("Select fields must have at least one option");
      } else if (field.options.length > 25) {
        errors.push("Select fields can have maximum 25 options");
      } else {
        field.options.forEach((option, index) => {
          if (!option || option.trim().length === 0) {
            errors.push(`Option ${index + 1} cannot be empty`);
          } else if (option.length > 100) {
            errors.push(`Option ${index + 1} must be 100 characters or less`);
          }
        });
      }
    }

    // Number field specific validation
    if (field.type === FormFieldType.NUMBER) {
      if (field.options && field.options.length > 0) {
        errors.push("Number fields should not have options");
      }
    }

    return errors;
  }

  /**
   * Validate Discord entities (forum channel and staff role)
   * @param forumChannelId - The forum channel ID
   * @param staffRoleId - The staff role ID
   * @param guild - The Discord guild
   * @param client - The Discord client
   * @returns Validation result
   */
  static async validateDiscordEntities(
    forumChannelId: string,
    staffRoleId: string,
    guild: Guild,
    client: Client
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const getter = new ThingGetter(client);

    // Validate forum channel
    const { data: channel, error: channelError } = await tryCatch(
      getter.getChannel(forumChannelId)
    );

    if (channelError) {
      errors.push(`Forum channel not found or bot cannot access it: ${channelError.message}`);
    } else if (channel) {
      if (!(channel instanceof ForumChannel)) {
        errors.push("Selected channel is not a forum channel");
      } else {
        // Check bot permissions in forum channel
        const botMember = guild.members.me;
        if (botMember) {
          const permissions = channel.permissionsFor(botMember);
          if (
            !permissions?.has([
              "ViewChannel",
              "SendMessages",
              "CreatePublicThreads",
              "ManageThreads",
            ])
          ) {
            warnings.push("Bot may not have sufficient permissions in the forum channel");
          }
        }
      }
    }

    // Validate staff role
    const { data: role, error: roleError } = await tryCatch(getter.getRole(guild, staffRoleId));

    if (roleError) {
      errors.push(`Staff role not found: ${roleError.message}`);
    } else if (role) {
      // Check if role is higher than bot's highest role
      const botMember = guild.members.me;
      if (botMember) {
        const botHighestRole = botMember.roles.highest;
        if (role.position >= botHighestRole.position && guild.ownerId !== client.user?.id) {
          warnings.push(
            "Staff role is higher than bot's highest role, may cause permission issues"
          );
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate category name uniqueness within a guild
   * @param categoryName - The category name to check
   * @param existingCategories - Array of existing categories
   * @param excludeCategoryId - Category ID to exclude from check (for updates)
   * @returns True if name is unique, false otherwise
   */
  static validateCategoryNameUnique(
    categoryName: string,
    existingCategories: CategoryType[],
    excludeCategoryId?: string
  ): boolean {
    const normalizedName = categoryName.toLowerCase().trim();

    return !existingCategories.some(
      (cat) => cat.id !== excludeCategoryId && cat.name.toLowerCase().trim() === normalizedName
    );
  }

  /**
   * Validate form field ID uniqueness within a category
   * @param fieldId - The field ID to check
   * @param existingFields - Array of existing form fields
   * @param excludeFieldId - Field ID to exclude from check (for updates)
   * @returns True if ID is unique, false otherwise
   */
  static validateFieldIdUnique(
    fieldId: string,
    existingFields: FormFieldSchema[],
    excludeFieldId?: string
  ): boolean {
    const normalizedId = fieldId.toLowerCase().trim();

    return !existingFields.some(
      (field) => field.id !== excludeFieldId && field.id.toLowerCase().trim() === normalizedId
    );
  }

  /**
   * Get default form field configuration for a given type
   * @param type - The form field type
   * @returns Default configuration for the field type
   */
  static getDefaultFormField(type: FormFieldType): Partial<FormFieldSchema> {
    const base = {
      type,
      required: false,
    };

    switch (type) {
      case FormFieldType.SHORT:
        return {
          ...base,
          placeholder: "Enter a short response...",
          maxLength: 100,
        };

      case FormFieldType.PARAGRAPH:
        return {
          ...base,
          placeholder: "Enter a detailed response...",
          maxLength: 1000,
        };

      case FormFieldType.NUMBER:
        return {
          ...base,
          placeholder: "Enter a number...",
        };

      case FormFieldType.SELECT:
        return {
          ...base,
          options: ["Option 1", "Option 2"],
        };

      default:
        return base;
    }
  }

  /**
   * Sanitize category data for storage
   * @param category - The category data to sanitize
   * @returns Sanitized category data
   */
  static sanitizeCategoryData(category: Partial<CategoryType>): Partial<CategoryType> {
    const sanitized: Partial<CategoryType> = {};

    if (category.name) {
      sanitized.name = category.name.trim();
    }

    if (category.description) {
      sanitized.description = category.description.trim();
    }

    if (category.emoji) {
      sanitized.emoji = category.emoji.trim();
    }

    if (category.forumChannelId) {
      sanitized.forumChannelId = category.forumChannelId.trim();
    }

    if (category.staffRoleId) {
      sanitized.staffRoleId = category.staffRoleId.trim();
    }

    if (category.priority !== undefined) {
      sanitized.priority = category.priority;
    }

    if (category.isActive !== undefined) {
      sanitized.isActive = category.isActive;
    }

    if (category.formFields) {
      sanitized.formFields = category.formFields.map((field) => ({
        id: field.id || "",
        type: field.type || FormFieldType.SHORT,
        required: field.required || false,
        label: field.label?.trim() || "",
        placeholder: field.placeholder?.trim() || undefined,
        options: field.options?.map((opt) => opt.trim()).filter((opt) => opt.length > 0),
        maxLength: field.maxLength,
        minLength: field.minLength,
      })) as any; // Type assertion needed due to Mongoose DocumentArray complexity
    }

    return sanitized;
  }
}
