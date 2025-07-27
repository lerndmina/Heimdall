import { EmbedBuilder, User, Client } from "discord.js";
import { FormFieldSchema, FormFieldType } from "../../models/ModmailConfig";

/**
 * Tracks form completion progress and provides user feedback
 */
export class FormProgressTracker {
  private fields: FormFieldSchema[];
  private completedFields: Set<string> = new Set();
  private responses: Map<string, any> = new Map();

  constructor(fields: FormFieldSchema[]) {
    this.fields = fields;
  }

  /**
   * Mark a field as completed
   * @param fieldId Field ID
   * @param value Field value
   */
  public markFieldCompleted(fieldId: string, value: any): void {
    this.completedFields.add(fieldId);
    this.responses.set(fieldId, value);
  }

  /**
   * Check if all required fields are completed
   * @returns True if all required fields are done
   */
  public isComplete(): boolean {
    const requiredFields = this.fields.filter((field) => field.required);
    return requiredFields.every((field) => this.completedFields.has(field.id));
  }

  /**
   * Get progress percentage
   * @returns Progress as percentage (0-100)
   */
  public getProgress(): number {
    if (this.fields.length === 0) return 100;
    return Math.round((this.completedFields.size / this.fields.length) * 100);
  }

  /**
   * Get next required field that needs to be completed
   * @returns Next required field or null if all are done
   */
  public getNextRequiredField(): FormFieldSchema | null {
    return (
      this.fields.find((field) => field.required && !this.completedFields.has(field.id)) || null
    );
  }

  /**
   * Create a progress embed for user feedback
   * @param client Discord client
   * @param user User completing the form
   * @param categoryName Category name
   * @returns Progress embed
   */
  public createProgressEmbed(client: Client, user: User, categoryName: string): EmbedBuilder {
    const progress = this.getProgress();
    const isComplete = this.isComplete();
    const nextField = this.getNextRequiredField();

    const embed = new EmbedBuilder()
      .setTitle(`📋 ${categoryName} Form Progress`)
      .setColor(isComplete ? 0x00ff00 : 0x3498db)
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    // Progress bar
    const progressBar = this.createProgressBar(progress);
    embed.addFields([
      {
        name: "📊 Progress",
        value: `${progressBar} ${progress}%\n${this.completedFields.size}/${this.fields.length} fields completed`,
        inline: false,
      },
    ]);

    // Show completed fields
    if (this.completedFields.size > 0) {
      const completed = Array.from(this.completedFields)
        .map((fieldId) => {
          const field = this.fields.find((f) => f.id === fieldId);
          const value = this.responses.get(fieldId);
          const displayValue =
            typeof value === "string" && value.length > 50
              ? value.substring(0, 47) + "..."
              : String(value);
          return `✅ **${field?.label || fieldId}**: ${displayValue}`;
        })
        .join("\n");

      embed.addFields([
        {
          name: "✅ Completed Fields",
          value: completed.length > 1024 ? completed.substring(0, 1021) + "..." : completed,
          inline: false,
        },
      ]);
    }

    // Show next required field
    if (nextField) {
      embed.addFields([
        {
          name: "⏳ Next Required Field",
          value: `**${nextField.label}** (${nextField.type})${
            nextField.placeholder ? `\n*${nextField.placeholder}*` : ""
          }`,
          inline: false,
        },
      ]);
    }

    if (isComplete) {
      embed.setDescription("🎉 **Form Complete!** All required fields have been filled out.");
    } else {
      const remaining = this.fields.filter(
        (field) => field.required && !this.completedFields.has(field.id)
      ).length;
      embed.setDescription(
        `📝 Please complete the remaining ${remaining} required field${remaining === 1 ? "" : "s"}.`
      );
    }

    return embed;
  }

  /**
   * Create a visual progress bar
   * @param progress Progress percentage
   * @returns Progress bar string
   */
  private createProgressBar(progress: number): string {
    const filledBlocks = Math.round(progress / 10);
    const emptyBlocks = 10 - filledBlocks;

    return "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
  }

  /**
   * Get all collected responses
   * @returns Map of field responses
   */
  public getResponses(): Map<string, any> {
    return new Map(this.responses);
  }

  /**
   * Get missing required fields
   * @returns Array of missing required field labels
   */
  public getMissingRequiredFields(): string[] {
    return this.fields
      .filter((field) => field.required && !this.completedFields.has(field.id))
      .map((field) => field.label);
  }

  /**
   * Validate a field value
   * @param fieldId Field ID
   * @param value Field value
   * @returns Validation result
   */
  public validateField(fieldId: string, value: any): { valid: boolean; error?: string } {
    const field = this.fields.find((f) => f.id === fieldId);
    if (!field) {
      return { valid: false, error: "Field not found" };
    }

    // Required field validation
    if (field.required && (!value || (typeof value === "string" && value.trim() === ""))) {
      return { valid: false, error: "This field is required" };
    }

    // Type-specific validation
    if (field.type === FormFieldType.NUMBER && value) {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return { valid: false, error: "Please enter a valid number" };
      }
    }

    // Length validation for text fields
    if ((field.type === FormFieldType.SHORT || field.type === FormFieldType.PARAGRAPH) && value) {
      const textValue = String(value);

      if (field.minLength && textValue.length < field.minLength) {
        return { valid: false, error: `Minimum length is ${field.minLength} characters` };
      }

      if (field.maxLength && textValue.length > field.maxLength) {
        return { valid: false, error: `Maximum length is ${field.maxLength} characters` };
      }
    }

    return { valid: true };
  }
}
