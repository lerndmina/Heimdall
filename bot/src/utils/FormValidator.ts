import {
  Guild,
  TextChannel,
  CategoryChannel,
  Role,
  PermissionsBitField,
  ChannelType,
  ForumChannel,
} from "discord.js";
import { FormFieldSchema, FormFieldType, CategoryType } from "../models/ModmailConfig";
import { FieldTypeHandlerFactory } from "./FormFieldHandlers";
import log from "./log";

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Form field validation context
 */
export interface FormValidationContext {
  guild: Guild;
  existingFieldIds?: string[];
  existingCategoryIds?: string[];
}

/**
 * Comprehensive form validation utility
 */
export class FormValidator {
  /**
   * Validate a complete form (array of fields)
   * @param fields Array of form fields to validate
   * @param context Validation context
   * @returns ValidationResult
   */
  public static validateForm(
    fields: FormFieldSchema[],
    context: FormValidationContext
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (!fields || fields.length === 0) {
      result.valid = false;
      result.errors.push("Form must have at least one field");
      return result;
    }

    if (fields.length > 25) {
      result.valid = false;
      result.errors.push("Form cannot have more than 25 fields total");
    }

    // Validate individual fields
    const fieldIds = new Set<string>();
    const fieldLabels = new Set<string>();
    let textFieldCount = 0;
    let selectFieldCount = 0;

    for (const field of fields) {
      // Validate individual field
      const fieldResult = this.validateFormField(field, context);
      result.errors.push(...fieldResult.errors);
      result.warnings.push(...fieldResult.warnings);

      if (!fieldResult.valid) {
        result.valid = false;
      }

      // Check for duplicate IDs
      if (fieldIds.has(field.id)) {
        result.valid = false;
        result.errors.push(`Duplicate field ID: ${field.id}`);
      }
      fieldIds.add(field.id);

      // Check for duplicate labels
      if (fieldLabels.has(field.label.toLowerCase())) {
        result.warnings.push(`Duplicate field label: ${field.label}`);
      }
      fieldLabels.add(field.label.toLowerCase());

      // Count field types
      if (
        field.type === FormFieldType.SHORT ||
        field.type === FormFieldType.PARAGRAPH ||
        field.type === FormFieldType.NUMBER
      ) {
        textFieldCount++;
      } else if (field.type === FormFieldType.SELECT) {
        selectFieldCount++;
      }
    }

    // Validate field type limits
    if (textFieldCount > 25) {
      result.valid = false;
      result.errors.push("Cannot have more than 25 text input fields (Discord modal limit)");
    }

    if (selectFieldCount > 5) {
      result.valid = false;
      result.errors.push("Cannot have more than 5 select menu fields (Discord component limit)");
    }

    // Check for too many required fields
    const requiredFields = fields.filter((f) => f.required);
    if (requiredFields.length > 20) {
      result.warnings.push("Having more than 20 required fields may overwhelm users");
    }

    return result;
  }

  /**
   * Validate a single form field
   * @param field Form field to validate
   * @param context Validation context
   * @returns ValidationResult
   */
  public static validateFormField(
    field: FormFieldSchema,
    context: FormValidationContext
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Basic field validation
    if (!field.id || field.id.trim().length === 0) {
      result.valid = false;
      result.errors.push("Field ID is required");
    } else {
      // Validate ID format
      if (!/^[a-zA-Z0-9_-]+$/.test(field.id)) {
        result.valid = false;
        result.errors.push("Field ID must contain only letters, numbers, hyphens, and underscores");
      }

      if (field.id.length > 100) {
        result.valid = false;
        result.errors.push("Field ID must be 100 characters or less");
      }

      // Check for reserved IDs
      if (this.isReservedFieldId(field.id)) {
        result.valid = false;
        result.errors.push(`Field ID "${field.id}" is reserved`);
      }

      // Check against existing field IDs
      if (context.existingFieldIds && context.existingFieldIds.includes(field.id)) {
        result.valid = false;
        result.errors.push(`Field ID "${field.id}" already exists`);
      }
    }

    if (!field.label || field.label.trim().length === 0) {
      result.valid = false;
      result.errors.push("Field label is required");
    } else if (field.label.length > 100) {
      result.valid = false;
      result.errors.push("Field label must be 100 characters or less");
    }

    if (!Object.values(FormFieldType).includes(field.type)) {
      result.valid = false;
      result.errors.push(`Invalid field type: ${field.type}`);
      return result; // Can't continue validation without valid type
    }

    // Validate placeholder
    if (field.placeholder && field.placeholder.length > 100) {
      result.valid = false;
      result.errors.push("Field placeholder must be 100 characters or less");
    }

    // Validate length constraints
    if (field.minLength !== undefined) {
      if (field.minLength < 0) {
        result.valid = false;
        result.errors.push("Field minLength cannot be negative");
      }
      if (field.minLength > 4000) {
        result.valid = false;
        result.errors.push("Field minLength cannot exceed 4000 characters");
      }
    }

    if (field.maxLength !== undefined) {
      if (field.maxLength < 1) {
        result.valid = false;
        result.errors.push("Field maxLength must be at least 1");
      }
      if (field.maxLength > 4000) {
        result.valid = false;
        result.errors.push("Field maxLength cannot exceed 4000 characters (Discord limit)");
      }
    }

    if (field.minLength !== undefined && field.maxLength !== undefined) {
      if (field.minLength > field.maxLength) {
        result.valid = false;
        result.errors.push("Field minLength cannot be greater than maxLength");
      }
    }

    // Use field type handler for specific validation
    try {
      FieldTypeHandlerFactory.validateField(field);
    } catch (error) {
      result.valid = false;
      result.errors.push(
        `Field type validation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    return result;
  }

  /**
   * Validate a category configuration
   * @param category Category to validate
   * @param context Validation context
   * @returns ValidationResult
   */
  public static async validateCategory(
    category: CategoryType,
    context: FormValidationContext
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Basic category validation
    if (!category.id || category.id.trim().length === 0) {
      result.valid = false;
      result.errors.push("Category ID is required");
    } else {
      if (!/^[a-zA-Z0-9_-]+$/.test(category.id)) {
        result.valid = false;
        result.errors.push(
          "Category ID must contain only letters, numbers, hyphens, and underscores"
        );
      }

      if (category.id.length > 50) {
        result.valid = false;
        result.errors.push("Category ID must be 50 characters or less");
      }

      if (context.existingCategoryIds && context.existingCategoryIds.includes(category.id)) {
        result.valid = false;
        result.errors.push(`Category ID "${category.id}" already exists`);
      }
    }

    if (!category.name || category.name.trim().length === 0) {
      result.valid = false;
      result.errors.push("Category name is required");
    } else if (category.name.length > 50) {
      result.valid = false;
      result.errors.push("Category name must be 50 characters or less");
    }

    if (category.description && category.description.length > 500) {
      result.valid = false;
      result.errors.push("Category description must be 500 characters or less");
    }

    // Validate Discord entities
    if (category.forumChannelId) {
      try {
        const channel = await context.guild.channels.fetch(category.forumChannelId);
        if (!channel) {
          result.valid = false;
          result.errors.push("Forum channel not found");
        } else if (channel.type !== ChannelType.GuildForum) {
          result.valid = false;
          result.errors.push("Channel must be a forum channel");
        } else {
          // Check bot permissions
          const botMember = context.guild.members.me;
          if (botMember) {
            const permissions = channel.permissionsFor(botMember);
            if (
              !permissions?.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.CreatePublicThreads,
                PermissionsBitField.Flags.ManageThreads,
              ])
            ) {
              result.warnings.push("Bot may not have sufficient permissions in the forum channel");
            }
          }
        }
      } catch (error) {
        result.valid = false;
        result.errors.push("Failed to validate forum channel");
      }
    }

    if (category.staffRoleId) {
      try {
        const role = await context.guild.roles.fetch(category.staffRoleId);
        if (!role) {
          result.warnings.push(`Staff role ${category.staffRoleId} not found`);
        }
      } catch (error) {
        result.warnings.push(`Failed to validate staff role ${category.staffRoleId}`);
      }
    }

    // Validate form fields if present
    if (category.formFields && category.formFields.length > 0) {
      const formResult = this.validateForm(category.formFields, context);
      result.errors.push(...formResult.errors.map((err) => `Form validation: ${err}`));
      result.warnings.push(...formResult.warnings.map((warn) => `Form validation: ${warn}`));

      if (!formResult.valid) {
        result.valid = false;
      }
    }

    return result;
  }

  /**
   * Validate form field input values
   * @param field Field configuration
   * @param value User input value
   * @returns ValidationResult
   */
  public static validateFieldInput(field: FormFieldSchema, value: any): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      FieldTypeHandlerFactory.validateInput(field, value);
    } catch (error) {
      result.valid = false;
      result.errors.push(error instanceof Error ? error.message : "Validation failed");
    }

    return result;
  }

  /**
   * Check if a field ID is reserved
   * @param fieldId Field ID to check
   * @returns True if reserved
   */
  private static isReservedFieldId(fieldId: string): boolean {
    const reserved = [
      "id",
      "category",
      "priority",
      "status",
      "created",
      "updated",
      "user",
      "guild",
      "channel",
      "thread",
      "staff",
      "closed",
      "archived",
      "deleted",
      "internal",
      "system",
    ];

    return reserved.includes(fieldId.toLowerCase());
  }

  /**
   * Create a comprehensive validation report
   * @param forms Array of forms to validate
   * @param categories Array of categories to validate
   * @param context Validation context
   * @returns Detailed validation report
   */
  public static async createValidationReport(
    forms: FormFieldSchema[][],
    categories: CategoryType[],
    context: FormValidationContext
  ): Promise<{
    overall: ValidationResult;
    forms: ValidationResult[];
    categories: ValidationResult[];
  }> {
    const overall: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Validate forms
    const formResults = forms.map((form) => this.validateForm(form, context));

    // Validate categories
    const categoryResults = await Promise.all(
      categories.map((category) => this.validateCategory(category, context))
    );

    // Aggregate results
    for (const result of [...formResults, ...categoryResults]) {
      overall.errors.push(...result.errors);
      overall.warnings.push(...result.warnings);
      if (!result.valid) {
        overall.valid = false;
      }
    }

    return {
      overall,
      forms: formResults,
      categories: categoryResults,
    };
  }

  /**
   * Quick validation for field ID uniqueness
   * @param fieldId Field ID to check
   * @param existingIds Array of existing field IDs
   * @returns True if ID is available
   */
  public static isFieldIdAvailable(fieldId: string, existingIds: string[]): boolean {
    if (!fieldId || fieldId.trim().length === 0) return false;
    if (this.isReservedFieldId(fieldId)) return false;
    if (existingIds.includes(fieldId)) return false;
    return true;
  }

  /**
   * Suggest alternative field ID if current one is taken
   * @param desiredId Desired field ID
   * @param existingIds Array of existing field IDs
   * @returns Available field ID suggestion
   */
  public static suggestFieldId(desiredId: string, existingIds: string[]): string {
    let baseId = desiredId
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "");

    if (baseId.length === 0) baseId = "field";
    if (baseId.length > 90) baseId = baseId.substring(0, 90);

    if (this.isFieldIdAvailable(baseId, existingIds)) {
      return baseId;
    }

    // Try with numbers
    for (let i = 1; i <= 999; i++) {
      const suggested = `${baseId}_${i}`;
      if (this.isFieldIdAvailable(suggested, existingIds)) {
        return suggested;
      }
    }

    // Fallback with timestamp
    const timestamp = Date.now().toString().slice(-6);
    return `${baseId}_${timestamp}`;
  }
}
