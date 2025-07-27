import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { FormFieldSchema, FormFieldType } from "../models/ModmailConfig";
import log from "./log";

/**
 * Interface for field type handler
 */
export interface FieldTypeHandler {
  /**
   * Create Discord component for this field type
   * @param field Field configuration
   * @param customId Custom ID for the component
   * @returns Discord component or component row
   */
  createComponent(field: FormFieldSchema, customId: string): any;

  /**
   * Validate field configuration
   * @param field Field to validate
   * @throws Error if invalid
   */
  validateField(field: FormFieldSchema): void;

  /**
   * Validate user input for this field type
   * @param field Field configuration
   * @param value User input value
   * @throws Error if invalid
   */
  validateInput(field: FormFieldSchema, value: any): void;

  /**
   * Format value for display
   * @param value Raw value
   * @returns Formatted string for display
   */
  formatValue(value: any): string;

  /**
   * Get maximum character limit for embed display
   */
  getDisplayLimit(): number;
}

/**
 * Handler for short text input fields
 */
export class ShortTextHandler implements FieldTypeHandler {
  createComponent(field: FormFieldSchema, customId: string): ActionRowBuilder<TextInputBuilder> {
    const textInput = new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(field.label)
      .setStyle(TextInputStyle.Short)
      .setRequired(field.required);

    if (field.placeholder) {
      textInput.setPlaceholder(field.placeholder);
    }

    if (field.minLength) {
      textInput.setMinLength(field.minLength);
    }

    if (field.maxLength) {
      textInput.setMaxLength(Math.min(field.maxLength, 4000)); // Discord limit
    }

    return new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
  }

  validateField(field: FormFieldSchema): void {
    if (field.maxLength && field.maxLength > 4000) {
      throw new Error(`Short text field "${field.label}" maxLength cannot exceed 4000 characters`);
    }

    if (field.minLength && field.maxLength && field.minLength > field.maxLength) {
      throw new Error(
        `Short text field "${field.label}" minLength cannot be greater than maxLength`
      );
    }

    if (field.options && field.options.length > 0) {
      log.warn(`Short text field "${field.label}" has options but they will be ignored`);
    }
  }

  validateInput(field: FormFieldSchema, value: string): void {
    if (field.required && (!value || value.trim().length === 0)) {
      throw new Error(`Field "${field.label}" is required`);
    }

    if (value) {
      if (field.minLength && value.length < field.minLength) {
        throw new Error(`Field "${field.label}" must be at least ${field.minLength} characters`);
      }

      if (field.maxLength && value.length > field.maxLength) {
        throw new Error(
          `Field "${field.label}" must be no more than ${field.maxLength} characters`
        );
      }
    }
  }

  formatValue(value: string): string {
    return value || "*No response*";
  }

  getDisplayLimit(): number {
    return 100; // Reasonable limit for inline display
  }
}

/**
 * Handler for paragraph text input fields
 */
export class ParagraphHandler implements FieldTypeHandler {
  createComponent(field: FormFieldSchema, customId: string): ActionRowBuilder<TextInputBuilder> {
    const textInput = new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(field.label)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(field.required);

    if (field.placeholder) {
      textInput.setPlaceholder(field.placeholder);
    }

    if (field.minLength) {
      textInput.setMinLength(field.minLength);
    }

    if (field.maxLength) {
      textInput.setMaxLength(Math.min(field.maxLength, 4000)); // Discord limit
    }

    return new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
  }

  validateField(field: FormFieldSchema): void {
    if (field.maxLength && field.maxLength > 4000) {
      throw new Error(`Paragraph field "${field.label}" maxLength cannot exceed 4000 characters`);
    }

    if (field.minLength && field.maxLength && field.minLength > field.maxLength) {
      throw new Error(
        `Paragraph field "${field.label}" minLength cannot be greater than maxLength`
      );
    }

    if (field.options && field.options.length > 0) {
      log.warn(`Paragraph field "${field.label}" has options but they will be ignored`);
    }
  }

  validateInput(field: FormFieldSchema, value: string): void {
    if (field.required && (!value || value.trim().length === 0)) {
      throw new Error(`Field "${field.label}" is required`);
    }

    if (value) {
      if (field.minLength && value.length < field.minLength) {
        throw new Error(`Field "${field.label}" must be at least ${field.minLength} characters`);
      }

      if (field.maxLength && value.length > field.maxLength) {
        throw new Error(
          `Field "${field.label}" must be no more than ${field.maxLength} characters`
        );
      }
    }
  }

  formatValue(value: string): string {
    if (!value) return "*No response*";
    return value.length > 500 ? `${value.substring(0, 497)}...` : value;
  }

  getDisplayLimit(): number {
    return 500; // Longer limit for paragraph fields
  }
}

/**
 * Handler for number input fields
 */
export class NumberHandler implements FieldTypeHandler {
  createComponent(field: FormFieldSchema, customId: string): ActionRowBuilder<TextInputBuilder> {
    const textInput = new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(field.label)
      .setStyle(TextInputStyle.Short)
      .setRequired(field.required)
      .setPlaceholder(field.placeholder || "Enter a number...");

    if (field.minLength) {
      textInput.setMinLength(field.minLength);
    }

    if (field.maxLength) {
      textInput.setMaxLength(Math.min(field.maxLength, 100)); // Reasonable limit for numbers
    }

    return new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
  }

  validateField(field: FormFieldSchema): void {
    if (field.maxLength && field.maxLength > 100) {
      log.warn(
        `Number field "${field.label}" has maxLength > 100, which may be excessive for numbers`
      );
    }

    if (field.options && field.options.length > 0) {
      log.warn(`Number field "${field.label}" has options but they will be ignored`);
    }
  }

  validateInput(field: FormFieldSchema, value: string): void {
    if (field.required && (!value || value.trim().length === 0)) {
      throw new Error(`Field "${field.label}" is required`);
    }

    if (value && value.trim().length > 0) {
      const numValue = parseFloat(value.trim());
      if (isNaN(numValue)) {
        throw new Error(`Field "${field.label}" must be a valid number`);
      }

      // Additional validation could be added here for min/max values
      // if those properties are added to the schema in the future
    }
  }

  formatValue(value: string): string {
    if (!value) return "*No response*";
    const numValue = parseFloat(value);
    return isNaN(numValue) ? value : numValue.toLocaleString();
  }

  getDisplayLimit(): number {
    return 50; // Short limit for numbers
  }
}

/**
 * Handler for select menu fields
 */
export class SelectHandler implements FieldTypeHandler {
  createComponent(
    field: FormFieldSchema,
    customId: string
  ): ActionRowBuilder<StringSelectMenuBuilder> {
    if (!field.options || field.options.length === 0) {
      throw new Error(`Select field "${field.label}" must have options`);
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(field.placeholder || `Select ${field.label}`)
      .setMinValues(field.required ? 1 : 0)
      .setMaxValues(field.options.length); // Allow multiple selections

    const options = field.options.map((option, index) => {
      const builder = new StringSelectMenuOptionBuilder()
        .setLabel(option.length > 100 ? `${option.substring(0, 97)}...` : option)
        .setValue(option);

      if (index < 5) {
        builder.setDescription(`Option ${index + 1}`);
      }

      return builder;
    });

    selectMenu.addOptions(options);

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  }

  validateField(field: FormFieldSchema): void {
    if (!field.options || field.options.length === 0) {
      throw new Error(`Select field "${field.label}" must have options`);
    }

    if (field.options.length > 25) {
      throw new Error(`Select field "${field.label}" cannot have more than 25 options`);
    }

    // Check for duplicate options
    const uniqueOptions = new Set(field.options);
    if (uniqueOptions.size !== field.options.length) {
      throw new Error(`Select field "${field.label}" has duplicate options`);
    }

    // Check option length limits
    const invalidOptions = field.options.filter((opt) => opt.length > 100);
    if (invalidOptions.length > 0) {
      throw new Error(
        `Select field "${field.label}" has options that are too long (max 100 characters)`
      );
    }

    if (field.minLength || field.maxLength) {
      log.warn(`Select field "${field.label}" has length constraints but they will be ignored`);
    }
  }

  validateInput(field: FormFieldSchema, value: string[]): void {
    if (field.required && (!value || value.length === 0)) {
      throw new Error(`Field "${field.label}" is required`);
    }

    if (value && field.options) {
      const invalidValues = value.filter((val) => !field.options!.includes(val));
      if (invalidValues.length > 0) {
        throw new Error(
          `Field "${field.label}" has invalid selections: ${invalidValues.join(", ")}`
        );
      }
    }
  }

  formatValue(value: string[]): string {
    if (!value || value.length === 0) return "*No selection*";
    if (value.length === 1) return value[0];
    return value.join("\n• ");
  }

  getDisplayLimit(): number {
    return 200; // Moderate limit for select values
  }
}

/**
 * Factory class for creating field type handlers
 */
export class FieldTypeHandlerFactory {
  private static handlers: Map<FormFieldType, FieldTypeHandler> = new Map();

  // Initialize handlers
  static {
    this.handlers.set(FormFieldType.SHORT, new ShortTextHandler());
    this.handlers.set(FormFieldType.PARAGRAPH, new ParagraphHandler());
    this.handlers.set(FormFieldType.NUMBER, new NumberHandler());
    this.handlers.set(FormFieldType.SELECT, new SelectHandler());
  }

  /**
   * Get handler for a specific field type
   * @param type Field type
   * @returns Handler instance
   */
  public static getHandler(type: FormFieldType): FieldTypeHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No handler found for field type: ${type}`);
    }
    return handler;
  }

  /**
   * Validate a field using its type handler
   * @param field Field to validate
   */
  public static validateField(field: FormFieldSchema): void {
    const handler = this.getHandler(field.type);
    handler.validateField(field);
  }

  /**
   * Create component for a field using its type handler
   * @param field Field configuration
   * @param customId Custom ID for the component
   * @returns Discord component
   */
  public static createComponent(field: FormFieldSchema, customId: string): any {
    const handler = this.getHandler(field.type);
    return handler.createComponent(field, customId);
  }

  /**
   * Validate input for a field using its type handler
   * @param field Field configuration
   * @param value Input value
   */
  public static validateInput(field: FormFieldSchema, value: any): void {
    const handler = this.getHandler(field.type);
    handler.validateInput(field, value);
  }

  /**
   * Format value for display using field type handler
   * @param field Field configuration
   * @param value Value to format
   * @returns Formatted string
   */
  public static formatValue(field: FormFieldSchema, value: any): string {
    const handler = this.getHandler(field.type);
    return handler.formatValue(value);
  }

  /**
   * Get all supported field types
   * @returns Array of supported FormFieldType values
   */
  public static getSupportedTypes(): FormFieldType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a field type is supported
   * @param type Field type to check
   * @returns True if supported
   */
  public static isTypeSupported(type: FormFieldType): boolean {
    return this.handlers.has(type);
  }
}

/**
 * Utility function to create a help embed explaining field types
 * @returns Discord embed with field type explanations
 */
export function createFieldTypeHelpEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📝 Form Field Types")
    .setDescription("Available field types for ticket forms:")
    .setColor(0x0099ff)
    .setTimestamp();

  embed.addFields([
    {
      name: "📝 Short Text",
      value:
        "Single line text input\n• Max 4000 characters\n• Good for names, titles, short answers",
      inline: true,
    },
    {
      name: "📄 Paragraph",
      value:
        "Multi-line text input\n• Max 4000 characters\n• Good for descriptions, detailed explanations",
      inline: true,
    },
    {
      name: "🔢 Number",
      value: "Numeric input only\n• Validates numeric format\n• Good for quantities, IDs, scores",
      inline: true,
    },
    {
      name: "📋 Select",
      value:
        "Dropdown selection menu\n• Max 25 options\n• Supports multiple selections\n• Good for categories, priorities",
      inline: true,
    },
  ]);

  embed.setFooter({ text: "Use these types when creating form fields for ticket categories" });

  return embed;
}
