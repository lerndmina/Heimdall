/**
 * ModmailConfig Model - Per-guild modmail system configuration
 *
 * Features:
 * - Forum channel configuration for modmail threads
 * - Webhook management for message relay
 * - Category system with custom forms (max 5 fields per Discord modal limit)
 * - Auto-close and activity tracking settings
 * - Staff notification configuration
 * - Thread naming pattern customization
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import crypto from "crypto";

/**
 * Form field types supported by Discord modals
 */
export enum ModmailFormFieldType {
  SHORT = "short",
  PARAGRAPH = "paragraph",
  SELECT = "select",
  NUMBER = "number",
}

/**
 * Form field interface
 */
export interface FormField {
  id: string;
  label: string;
  type: ModmailFormFieldType;
  required: boolean;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  options?: Array<{ label: string; value: string }>;
  minValue?: number;
  maxValue?: number;
}

/**
 * Form field schema for category customization
 */
const FormFieldSchema = new Schema<FormField>(
  {
    id: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
      maxlength: 45,
    },
    type: {
      type: String,
      enum: Object.values(ModmailFormFieldType),
      required: true,
    },
    required: {
      type: Boolean,
      default: true,
    },
    placeholder: {
      type: String,
      maxlength: 100,
    },
    minLength: {
      type: Number,
      min: 0,
      max: 4000,
    },
    maxLength: {
      type: Number,
      min: 1,
      max: 4000,
    },
    options: [
      {
        label: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],
    minValue: {
      type: Number,
    },
    maxValue: {
      type: Number,
    },
  },
  { _id: false },
);

/**
 * Modmail category interface
 */
export interface ModmailCategory {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  forumChannelId: string;
  webhookId: string;
  encryptedWebhookToken: string;
  staffRoleIds: string[];
  priority: 1 | 2 | 3 | 4;
  formFields: FormField[];
  autoCloseHours?: number;
  resolveAutoCloseHours: number;
  enabled: boolean;
  openTagId?: string;
  closedTagId?: string;
}

/**
 * Modmail category schema
 */
const ModmailCategorySchema = new Schema<ModmailCategory>(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      maxlength: 100,
    },
    emoji: {
      type: String,
    },

    // Forum channel configuration (required for each category)
    forumChannelId: {
      type: String,
      required: true,
    },

    // Webhook configuration for message relay (required for each category)
    webhookId: {
      type: String,
      required: true,
    },
    encryptedWebhookToken: {
      type: String,
      required: true,
    },

    // Staff notification configuration
    staffRoleIds: [
      {
        type: String,
      },
    ],

    // Priority level (affects notification urgency and auto-close timing)
    priority: {
      type: Number,
      enum: [1, 2, 3, 4], // 1=LOW, 2=NORMAL, 3=HIGH, 4=URGENT
      default: 2,
    },

    // Custom form fields (max 5 per Discord modal limit)
    formFields: [FormFieldSchema],

    // Auto-close settings (can override global settings)
    autoCloseHours: {
      type: Number,
      min: 1,
      max: 8760, // 1 year max
    },

    // Resolution settings
    resolveAutoCloseHours: {
      type: Number,
      min: 1,
      max: 168, // 1 week max
      default: 24,
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    // Forum tags for this category's forum channel
    openTagId: {
      type: String,
    },
    closedTagId: {
      type: String,
    },
  },
  { _id: false },
);

/**
 * Typing indicator style enum
 */
export enum TypingIndicatorStyle {
  NATIVE = "native", // Discord's native typing indicator
  MESSAGE = "message", // Temporary "User is typing..." embed
  BOTH = "both", // Both native and message
}

/**
 * Forum tags configuration for category
 */
export interface ForumTagsConfig {
  openTagId?: string;
  closedTagId?: string;
}

/**
 * Forum tags schema
 */
const ForumTagsSchema = new Schema<ForumTagsConfig>(
  {
    openTagId: {
      type: String,
    },
    closedTagId: {
      type: String,
    },
  },
  { _id: false },
);

/**
 * Main modmail configuration schema
 */
const ModmailConfigSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
    },

    // Staff notification configuration
    globalStaffRoleIds: [
      {
        type: String,
      },
    ],

    // Thread configuration
    threadNamingPattern: {
      type: String,
      default: "#{number} | {username} | {claimer}",
    },

    nextTicketNumber: {
      type: Number,
      default: 1,
    },

    // Message validation
    minimumMessageLength: {
      type: Number,
      default: 50,
      min: 1,
    },

    // Rate limiting
    rateLimitSeconds: {
      type: Number,
      default: 5,
      min: 1,
    },

    // Auto-close configuration
    enableAutoClose: {
      type: Boolean,
      default: true,
    },

    enableInactivityWarning: {
      type: Boolean,
      default: true,
    },

    autoCloseHours: {
      type: Number,
      default: 72, // 3 days default
      min: 1,
      max: 8760, // 1 year max
    },

    autoCloseWarningHours: {
      type: Number,
      default: 12,
      min: 1,
    },

    // Typing indicator configuration
    typingIndicators: {
      type: Boolean,
      default: true,
    },

    typingIndicatorStyle: {
      type: String,
      enum: Object.values(TypingIndicatorStyle),
      default: TypingIndicatorStyle.NATIVE,
    },

    // Forum tags configuration (per-guild)
    forumTags: {
      type: ForumTagsSchema,
      default: () => ({}),
    },

    // Categories
    categories: [ModmailCategorySchema],

    // Default category (used when no categories configured or user doesn't select)
    defaultCategoryId: {
      type: String,
    },

    // Feature toggles
    allowAttachments: {
      type: Boolean,
      default: true,
    },

    maxAttachmentSizeMB: {
      type: Number,
      default: 25, // Discord limit is 25MB for non-Nitro
      min: 1,
      max: 100,
    },

    // Activity tracking
    trackUserActivity: {
      type: Boolean,
      default: true,
    },

    trackStaffActivity: {
      type: Boolean,
      default: true,
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    // Schema version for future migrations
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Encrypt webhook token using AES-256-CBC with random salt
 * Output format: salt:iv:encrypted (hex-encoded)
 */
ModmailConfigSchema.statics.encryptWebhookToken = function (token: string, encryptionKey: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");

  return salt.toString("hex") + ":" + iv.toString("hex") + ":" + encrypted;
};

/**
 * Decrypt webhook token using AES-256-CBC
 * Supports both new format (salt:iv:encrypted) and legacy format (iv:encrypted with hardcoded salt)
 */
ModmailConfigSchema.statics.decryptWebhookToken = function (encryptedToken: string, encryptionKey: string): string {
  const parts = encryptedToken.split(":");

  let salt: Buffer;
  let iv: Buffer;
  let encrypted: string;

  if (parts.length === 3) {
    // New format: salt:iv:encrypted
    salt = Buffer.from(parts[0]!, "hex");
    iv = Buffer.from(parts[1]!, "hex");
    encrypted = parts[2]!;
  } else if (parts.length === 2) {
    // Legacy format: iv:encrypted (hardcoded salt)
    salt = Buffer.from("salt");
    iv = Buffer.from(parts[0]!, "hex");
    encrypted = parts[1]!;
  } else {
    throw new Error("Invalid encrypted token format");
  }

  const key = crypto.scryptSync(encryptionKey, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

/**
 * Get next ticket number and increment
 */
ModmailConfigSchema.methods.getNextTicketNumber = async function (): Promise<number> {
  const current = this.nextTicketNumber;
  this.nextTicketNumber += 1;
  await this.save();
  return current;
};

/**
 * Find category by ID
 */
ModmailConfigSchema.methods.getCategoryById = function (categoryId: string): ModmailCategory | null {
  return this.categories.find((cat: ModmailCategory) => cat.id === categoryId) || null;
};

/**
 * Get default category
 */
ModmailConfigSchema.methods.getDefaultCategory = function (): ModmailCategory | null {
  if (this.defaultCategoryId) {
    return this.getCategoryById(this.defaultCategoryId);
  }
  return this.categories[0] || null; // First category as fallback
};

// Infer TypeScript type from schema
type IModmailConfig = InferSchemaType<typeof ModmailConfigSchema>;

// Interface for static methods
interface IModmailConfigModel extends Model<IModmailConfig> {
  encryptWebhookToken(token: string, encryptionKey: string): string;
  decryptWebhookToken(encryptedToken: string, encryptionKey: string): string;
}

// Export model with hot-reload safety
const ModmailConfig = (mongoose.models.ModmailConfig || model<IModmailConfig, IModmailConfigModel>("ModmailConfig", ModmailConfigSchema)) as IModmailConfigModel;

export default ModmailConfig;
export type { IModmailConfig, IModmailConfigModel };
