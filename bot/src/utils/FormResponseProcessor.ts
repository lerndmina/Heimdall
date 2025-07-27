import {
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  ComponentType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { FormFieldSchema, FormFieldType } from "../models/ModmailConfig";
import { FormBuilder } from "./FormBuilder";
import log from "./log";

/**
 * Represents form responses collected from user interaction
 */
export interface FormResponse {
  fieldId: string;
  fieldLabel: string;
  fieldType: FormFieldType;
  value: string | string[];
  required: boolean;
}

/**
 * Represents a complete form submission
 */
export interface FormSubmission {
  userId: string;
  categoryId: string;
  responses: FormResponse[];
  submittedAt: Date;
  isComplete: boolean;
}

/**
 * Utility class for processing and managing form responses
 */
export class FormResponseProcessor {
  private fields: FormFieldSchema[];
  private responses: Map<string, FormResponse> = new Map();
  private userId: string;
  private categoryId: string;

  constructor(fields: FormFieldSchema[], userId: string, categoryId: string) {
    this.fields = fields;
    this.userId = userId;
    this.categoryId = categoryId;
  }

  /**
   * Process a modal submission and add responses
   * @param interaction Modal submit interaction
   * @param modalIndex Index of the modal (for multi-modal forms)
   */
  public async processModalSubmission(
    interaction: ModalSubmitInteraction,
    modalIndex: number = 0
  ): Promise<void> {
    try {
      const textFields = this.fields.filter(
        (field) =>
          field.type === FormFieldType.SHORT ||
          field.type === FormFieldType.PARAGRAPH ||
          field.type === FormFieldType.NUMBER
      );

      // Get fields for this specific modal (5 fields per modal max)
      const startIndex = modalIndex * 5;
      const modalFields = textFields.slice(startIndex, startIndex + 5);

      const modalResponses = FormBuilder.processModalSubmission(interaction, modalFields);

      // Add responses to our collection
      modalFields.forEach((field) => {
        if (modalResponses[field.id] !== undefined) {
          this.responses.set(field.id, {
            fieldId: field.id,
            fieldLabel: field.label,
            fieldType: field.type,
            value: modalResponses[field.id],
            required: field.required,
          });
        }
      });

      log.debug(`Processed modal ${modalIndex} submission for user ${this.userId}`);
    } catch (error) {
      log.error("Error processing modal submission:", error);
      throw error;
    }
  }

  /**
   * Process a select menu interaction and add response
   * @param interaction Select menu interaction
   * @param fieldId ID of the field being responded to
   */
  public async processSelectMenuInteraction(
    interaction: StringSelectMenuInteraction,
    fieldId: string
  ): Promise<void> {
    try {
      const field = this.fields.find((f) => f.id === fieldId);
      if (!field) {
        throw new Error(`Field ${fieldId} not found`);
      }

      if (field.type !== FormFieldType.SELECT) {
        throw new Error(`Field ${fieldId} is not a select field`);
      }

      const values = FormBuilder.processSelectMenuInteraction(interaction, field);

      this.responses.set(fieldId, {
        fieldId: field.id,
        fieldLabel: field.label,
        fieldType: field.type,
        value: values,
        required: field.required,
      });

      log.debug(`Processed select menu for field ${fieldId}, user ${this.userId}`);
    } catch (error) {
      log.error("Error processing select menu interaction:", error);
      throw error;
    }
  }

  /**
   * Check if all required fields have been completed
   * @returns True if form is complete
   */
  public isFormComplete(): boolean {
    const requiredFields = this.fields.filter((field) => field.required);

    for (const field of requiredFields) {
      const response = this.responses.get(field.id);
      if (!response || this.isEmptyResponse(response.value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all missing required fields
   * @returns Array of missing field labels
   */
  public getMissingRequiredFields(): string[] {
    const missing: string[] = [];
    const requiredFields = this.fields.filter((field) => field.required);

    for (const field of requiredFields) {
      const response = this.responses.get(field.id);
      if (!response || this.isEmptyResponse(response.value)) {
        missing.push(field.label);
      }
    }

    return missing;
  }

  /**
   * Get the current form submission
   * @returns FormSubmission object
   */
  public getFormSubmission(): FormSubmission {
    return {
      userId: this.userId,
      categoryId: this.categoryId,
      responses: Array.from(this.responses.values()),
      submittedAt: new Date(),
      isComplete: this.isFormComplete(),
    };
  }

  /**
   * Create an embed showing current form progress
   * @returns Discord embed showing form status
   */
  public createProgressEmbed(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("📋 Form Progress")
      .setColor(this.isFormComplete() ? 0x00ff00 : 0xffa500)
      .setTimestamp();

    const completedFields = Array.from(this.responses.values());
    const totalFields = this.fields.length;
    const requiredFields = this.fields.filter((f) => f.required).length;
    const completedRequired = completedFields.filter((r) => r.required).length;

    embed.addFields([
      {
        name: "📊 Progress",
        value: `**Total:** ${completedFields.length}/${totalFields} fields\n**Required:** ${completedRequired}/${requiredFields} fields`,
        inline: true,
      },
      {
        name: "✅ Status",
        value: this.isFormComplete() ? "**Complete**" : "**In Progress**",
        inline: true,
      },
    ]);

    // Show completed fields
    if (completedFields.length > 0) {
      const fieldsList = completedFields
        .map((response) => {
          const valueDisplay = Array.isArray(response.value)
            ? response.value.join(", ")
            : response.value;
          const truncated =
            valueDisplay.length > 50 ? `${valueDisplay.substring(0, 47)}...` : valueDisplay;
          return `**${response.fieldLabel}:** ${truncated}`;
        })
        .join("\n");

      embed.addFields([
        {
          name: "📝 Completed Fields",
          value: fieldsList.length > 1024 ? fieldsList.substring(0, 1021) + "..." : fieldsList,
          inline: false,
        },
      ]);
    }

    // Show missing required fields
    const missing = this.getMissingRequiredFields();
    if (missing.length > 0) {
      embed.addFields([
        {
          name: "⚠️ Missing Required Fields",
          value: missing.map((label) => `• ${label}`).join("\n"),
          inline: false,
        },
      ]);
    }

    return embed;
  }

  /**
   * Create an embed showing the final form responses
   * @returns Discord embed with all responses
   */
  public createResponsesEmbed(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("📋 Form Responses")
      .setColor(0x0099ff)
      .setTimestamp();

    const responses = Array.from(this.responses.values());

    if (responses.length === 0) {
      embed.setDescription("No responses collected yet.");
      return embed;
    }

    // Group responses by type for better organization
    const groupedResponses = responses.reduce((groups, response) => {
      const type = response.fieldType;
      if (!groups[type]) groups[type] = [];
      groups[type].push(response);
      return groups;
    }, {} as Record<FormFieldType, FormResponse[]>);

    // Add fields to embed
    for (const [type, typeResponses] of Object.entries(groupedResponses)) {
      for (const response of typeResponses) {
        const valueDisplay = Array.isArray(response.value)
          ? response.value.join("\n• ")
          : response.value;

        embed.addFields([
          {
            name: `${response.required ? "⭐" : "📝"} ${response.fieldLabel}`,
            value:
              valueDisplay.length > 1024
                ? `${valueDisplay.substring(0, 1021)}...`
                : valueDisplay || "*No response*",
            inline: response.fieldType === FormFieldType.SHORT,
          },
        ]);
      }
    }

    return embed;
  }

  /**
   * Reset all responses
   */
  public clearResponses(): void {
    this.responses.clear();
    log.debug(`Cleared form responses for user ${this.userId}`);
  }

  /**
   * Get response for a specific field
   * @param fieldId Field ID to get response for
   * @returns Response or undefined if not found
   */
  public getResponse(fieldId: string): FormResponse | undefined {
    return this.responses.get(fieldId);
  }

  /**
   * Check if a response value is empty
   * @param value Response value to check
   * @returns True if value is empty
   */
  private isEmptyResponse(value: string | string[]): boolean {
    if (Array.isArray(value)) {
      return value.length === 0 || value.every((v) => !v || v.trim().length === 0);
    }
    return !value || value.trim().length === 0;
  }

  /**
   * Validate all current responses against field constraints
   * @throws Error if validation fails
   */
  public validateAllResponses(): void {
    for (const response of this.responses.values()) {
      const field = this.fields.find((f) => f.id === response.fieldId);
      if (!field) continue;

      if (Array.isArray(response.value)) {
        // Select field validation
        if (field.required && response.value.length === 0) {
          throw new Error(`Field "${field.label}" is required`);
        }
      } else {
        // Text field validation
        if (field.required && this.isEmptyResponse(response.value)) {
          throw new Error(`Field "${field.label}" is required`);
        }

        if (response.value) {
          // Length validation
          if (field.minLength && response.value.length < field.minLength) {
            throw new Error(
              `Field "${field.label}" must be at least ${field.minLength} characters`
            );
          }

          if (field.maxLength && response.value.length > field.maxLength) {
            throw new Error(
              `Field "${field.label}" must be no more than ${field.maxLength} characters`
            );
          }

          // Number validation
          if (field.type === FormFieldType.NUMBER) {
            const numValue = parseFloat(response.value);
            if (isNaN(numValue)) {
              throw new Error(`Field "${field.label}" must be a valid number`);
            }
          }
        }
      }
    }
  }
}

/**
 * Helper function to create form field type display name
 * @param type FormFieldType enum value
 * @returns Human-readable type name
 */
export function getFieldTypeDisplayName(type: FormFieldType): string {
  switch (type) {
    case FormFieldType.SHORT:
      return "Short Text";
    case FormFieldType.PARAGRAPH:
      return "Long Text";
    case FormFieldType.SELECT:
      return "Selection";
    case FormFieldType.NUMBER:
      return "Number";
    default:
      return "Unknown";
  }
}

/**
 * Helper function to format form responses for storage
 * @param responses Array of form responses
 * @returns Record suitable for database storage
 */
export function formatResponsesForStorage(responses: FormResponse[]): Record<string, any> {
  const formatted: Record<string, any> = {};

  for (const response of responses) {
    formatted[response.fieldId] = {
      label: response.fieldLabel,
      type: response.fieldType,
      value: response.value,
      required: response.required,
    };
  }

  return formatted;
}
