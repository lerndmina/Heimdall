import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  SelectMenuComponentOptionData,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  ComponentType,
  ButtonStyle,
  ButtonBuilder,
} from "discord.js";
import { FormFieldType, FormFieldSchema } from "../models/ModmailConfig";
import log from "./log";

/**
 * Utility class for building and handling Discord forms/modals
 */
export class FormBuilder {
  private fields: FormFieldSchema[];
  private maxFieldsPerModal = 5; // Discord modal limit

  constructor(fields: FormFieldSchema[]) {
    this.fields = fields;
  }

  /**
   * Create Discord modals from form fields
   * @param customId Base custom ID for the modal
   * @param title Modal title
   * @returns Array of modals (may be multiple if more than 5 fields)
   */
  public createModals(customId: string, title: string): ModalBuilder[] {
    const modals: ModalBuilder[] = [];
    const textFields = this.fields.filter(
      (field) => field.type === FormFieldType.SHORT || field.type === FormFieldType.PARAGRAPH
    );

    // Split text fields into chunks of 5 (Discord modal limit)
    const fieldChunks = this.chunkArray(textFields, this.maxFieldsPerModal);

    fieldChunks.forEach((chunk, index) => {
      const modal = new ModalBuilder()
        .setCustomId(`${customId}_${index}`)
        .setTitle(fieldChunks.length > 1 ? `${title} (${index + 1}/${fieldChunks.length})` : title);

      const rows = chunk.map((field) => this.createTextInputRow(field));
      modal.addComponents(...rows);

      modals.push(modal);
    });

    return modals;
  }

  /**
   * Create select menu for single/multiple choice fields
   * @param field The select field configuration
   * @param customId Custom ID for the select menu
   * @returns ActionRow with select menu
   */
  public createSelectMenu(
    field: FormFieldSchema,
    customId: string
  ): ActionRowBuilder<StringSelectMenuBuilder> {
    if (!field.options || field.options.length === 0) {
      throw new Error(`Select field "${field.label}" has no options`);
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(field.placeholder || `Select ${field.label}`)
      .setMinValues(field.required ? 1 : 0)
      .setMaxValues(field.type === FormFieldType.SELECT ? field.options!.length : 1);

    const options = field.options!.map((option, index) =>
      new StringSelectMenuOptionBuilder().setLabel(option).setValue(option)
    );

    selectMenu.addOptions(options);

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  }

  /**
   * Process modal submission and extract form responses
   * @param interaction Modal submit interaction
   * @param fields Original form fields for validation
   * @returns Processed form responses
   */
  public static processModalSubmission(
    interaction: ModalSubmitInteraction,
    fields: FormFieldSchema[]
  ): Record<string, string> {
    const responses: Record<string, string> = {};

    try {
      fields.forEach((field) => {
        if (field.type === FormFieldType.SHORT || field.type === FormFieldType.PARAGRAPH) {
          const component = interaction.fields.getTextInputValue(field.id);

          // Validate required fields
          if (field.required && (!component || component.trim().length === 0)) {
            throw new Error(`Field "${field.label}" is required`);
          }

          // Validate field constraints
          if (component) {
            this.validateFieldValue(field, component);
            responses[field.id] = component.trim();
          }
        }
      });

      log.debug("Form responses processed:", responses);
      return responses;
    } catch (error) {
      log.error("Error processing modal submission:", error);
      throw error;
    }
  }

  /**
   * Process select menu interaction
   * @param interaction Select menu interaction
   * @param field Original field configuration
   * @returns Selected values
   */
  public static processSelectMenuInteraction(
    interaction: StringSelectMenuInteraction,
    field: FormFieldSchema
  ): string[] {
    try {
      const values = interaction.values;

      // Validate required fields
      if (field.required && values.length === 0) {
        throw new Error(`Field "${field.label}" is required`);
      }

      // Validate that selected values are valid options
      if (field.options) {
        const validValues = field.options; // options are already strings
        const invalidValues = values.filter((val) => !validValues.includes(val));

        if (invalidValues.length > 0) {
          throw new Error(`Invalid selection: ${invalidValues.join(", ")}`);
        }
      }

      log.debug(`Select menu processed for field ${field.id}:`, values);
      return values;
    } catch (error) {
      log.error("Error processing select menu interaction:", error);
      throw error;
    }
  }

  /**
   * Combine multiple form responses into a single object
   * @param modalResponses Text input responses from modals
   * @param selectResponses Select menu responses
   * @returns Combined form responses
   */
  public static combineFormResponses(
    modalResponses: Record<string, string>[],
    selectResponses: Record<string, string[]>
  ): Record<string, string | string[]> {
    const combined: Record<string, string | string[]> = {};

    // Add modal responses
    modalResponses.forEach((responses) => {
      Object.assign(combined, responses);
    });

    // Add select responses
    Object.assign(combined, selectResponses);

    return combined;
  }

  /**
   * Validate field value against constraints
   * @param field Field configuration
   * @param value User input value
   */
  private static validateFieldValue(field: FormFieldSchema, value: string): void {
    // Apply default max length if not specified
    let maxLength = field.maxLength;
    if (!maxLength) {
      maxLength = field.type === FormFieldType.PARAGRAPH ? 1000 : 500;
    }

    // Check min/max length
    if (field.minLength && value.length < field.minLength) {
      throw new Error(`Field "${field.label}" must be at least ${field.minLength} characters`);
    }

    if (value.length > maxLength) {
      throw new Error(`Field "${field.label}" must be no more than ${maxLength} characters`);
    }

    // Validate number fields
    if (field.type === FormFieldType.NUMBER) {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        throw new Error(`Field "${field.label}" must be a valid number`);
      }
    }
  }

  /**
   * Create a text input row for modal
   * @param field Form field configuration
   * @returns ActionRow with text input
   */
  private createTextInputRow(field: FormFieldSchema): ActionRowBuilder<TextInputBuilder> {
    const textInput = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(
        field.type === FormFieldType.PARAGRAPH ? TextInputStyle.Paragraph : TextInputStyle.Short
      )
      .setRequired(field.required);

    if (field.placeholder) {
      textInput.setPlaceholder(field.placeholder);
    }

    if (field.minLength) {
      textInput.setMinLength(field.minLength);
    }

    // Apply maxLength from field config, or default based on field type
    let maxLength = field.maxLength;
    if (!maxLength) {
      // Set default limits to prevent embed overflow
      maxLength = field.type === FormFieldType.PARAGRAPH ? 1000 : 500;
    }
    
    // Ensure we don't exceed Discord's limits
    maxLength = Math.min(maxLength, 4000);
    textInput.setMaxLength(maxLength);

    return new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
  }

  /**
   * Split array into chunks of specified size
   * @param array Array to chunk
   * @param size Chunk size
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get all select menu fields from form
   * @returns Array of select fields
   */
  public getSelectFields(): FormFieldSchema[] {
    return this.fields.filter((field) => field.type === FormFieldType.SELECT);
  }

  /**
   * Get all text input fields from form
   * @returns Array of text fields
   */
  public getTextFields(): FormFieldSchema[] {
    return this.fields.filter(
      (field) =>
        field.type === FormFieldType.SHORT ||
        field.type === FormFieldType.PARAGRAPH ||
        field.type === FormFieldType.NUMBER
    );
  }

  /**
   * Check if form has any fields that require modals
   * @returns True if form has text input fields
   */
  public hasModalFields(): boolean {
    return this.getTextFields().length > 0;
  }

  /**
   * Check if form has any select menu fields
   * @returns True if form has select fields
   */
  public hasSelectFields(): boolean {
    return this.getSelectFields().length > 0;
  }

  /**
   * Validate all form fields configuration
   * @throws Error if validation fails
   */
  public validateConfiguration(): void {
    this.fields.forEach((field) => {
      // Basic field validation
      if (!field.id || !field.label) {
        throw new Error("All fields must have id and label");
      }

      // Validate select field options
      if (field.type === FormFieldType.SELECT) {
        if (!field.options || field.options.length === 0) {
          throw new Error(`Select field "${field.label}" must have options`);
        }

        if (field.options.length > 25) {
          throw new Error(`Select field "${field.label}" cannot have more than 25 options`);
        }
      }

      // Validate length constraints
      if (field.minLength && field.maxLength && field.minLength > field.maxLength) {
        throw new Error(`Field "${field.label}" minLength cannot be greater than maxLength`);
      }

      // Validate number constraints - removed since schema doesn't include minValue/maxValue
      // Number validation happens in validateFieldValue method
    });

    // Check total field limits
    const textFields = this.getTextFields().length;
    const selectFields = this.getSelectFields().length;

    if (textFields > 25) {
      // Conservative limit for multiple modals
      throw new Error("Forms cannot have more than 25 text input fields");
    }

    if (selectFields > 5) {
      // Discord component limit per message
      throw new Error("Forms cannot have more than 5 select menu fields");
    }
  }
}
