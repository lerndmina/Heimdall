import { InferSchemaType, Schema, model } from "mongoose";

export enum ModmailStatus {
  OPEN = "open",
  CLOSED = "closed",
}

export enum FormFieldType {
  SHORT = "short",
  PARAGRAPH = "paragraph",
  SELECT = "select",
  NUMBER = "number",
}

export enum TicketPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  URGENT = 4,
}

const tagsSchema = new Schema(
  {
    snowflake: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ModmailStatus),
      default: ModmailStatus.OPEN,
    },
  },
  { _id: false }
);

const formFieldSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: Object.values(FormFieldType),
      required: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
    placeholder: {
      type: String,
      required: false,
      maxlength: 100,
    },
    options: {
      type: [String],
      required: false,
      validate: {
        validator: function (this: any, value: string[]) {
          // Options are required for SELECT type, optional for others
          return this.type !== FormFieldType.SELECT || (value && value.length > 0);
        },
        message: "Options are required for select fields",
      },
    },
    maxLength: {
      type: Number,
      required: false,
      min: 1,
      max: 4000, // Discord modal limit
    },
    minLength: {
      type: Number,
      required: false,
      min: 0,
      max: 4000,
    },
  },
  { _id: false }
);

const defaultCategorySchema = new Schema(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 50,
    },
    description: {
      type: String,
      required: false,
      maxlength: 200,
    },
    emoji: {
      type: String,
      required: false,
      maxlength: 10,
    },
    // Default category inherits forumChannelId and staffRoleId from main config
    // forumChannelId: NOT INCLUDED - uses main config's forumChannelId
    // staffRoleId: NOT INCLUDED - uses main config's staffRoleId
    priority: {
      type: Number,
      enum: Object.values(TicketPriority),
      default: TicketPriority.MEDIUM,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    formFields: {
      type: [formFieldSchema],
      default: [],
      validate: {
        validator: function (value: any[]) {
          // Maximum 5 form fields per category to fit in Discord modal
          return value.length <= 5;
        },
        message: "Maximum 5 form fields allowed per category",
      },
    },
    // AI Configuration for default category
    aiConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      systemPrompt: {
        type: String,
        required: false,
        maxlength: 2000,
      },
      preventModmailCreation: {
        type: Boolean,
        default: false,
      },
      includeFormData: {
        type: Boolean,
        default: true,
      },
      responseStyle: {
        type: String,
        enum: ["helpful", "formal", "casual"],
        default: "helpful",
      },
      maxTokens: {
        type: Number,
        default: 500,
        min: 50,
        max: 2000,
      },
    },
  },
  { _id: false }
);

const categorySchema = new Schema(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 50,
    },
    description: {
      type: String,
      required: false,
      maxlength: 200,
    },
    emoji: {
      type: String,
      required: false,
      maxlength: 10,
    },
    forumChannelId: {
      type: String,
      required: true,
      index: true,
    },
    // staffRoleId is optional for additional categories - if not provided, uses master role
    staffRoleId: {
      type: String,
      required: false, // Optional for additional categories
    },
    priority: {
      type: Number,
      enum: Object.values(TicketPriority),
      default: TicketPriority.MEDIUM,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    formFields: {
      type: [formFieldSchema],
      default: [],
      validate: {
        validator: function (value: any[]) {
          // Maximum 5 form fields per category to fit in Discord modal
          return value.length <= 5;
        },
        message: "Maximum 5 form fields allowed per category",
      },
    },
    // AI Configuration for additional categories
    aiConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      systemPrompt: {
        type: String,
        required: false,
        maxlength: 2000,
      },
      preventModmailCreation: {
        type: Boolean,
        default: false,
      },
      includeFormData: {
        type: Boolean,
        default: true,
      },
      responseStyle: {
        type: String,
        enum: ["helpful", "formal", "casual"],
        default: "helpful",
      },
      maxTokens: {
        type: Number,
        default: 500,
        min: 50,
        max: 2000,
      },
    },
  },
  { _id: false }
);

const ModmailConfig = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true, // Ensure one config per guild
      index: true, // Index for faster guild lookups
    },
    guildDescription: {
      type: String,
      required: false,
    },

    // Master staff role that can access all categories
    masterStaffRoleId: {
      type: String,
      required: false, // Optional for backward compatibility
      index: true,
    },

    // Default category (mandatory for all guilds)
    defaultCategory: {
      type: defaultCategorySchema,
      required: false, // Optional for backward compatibility
    },

    // Additional categories
    categories: {
      type: [categorySchema],
      default: [],
      validate: {
        validator: function (value: any[]) {
          // Maximum 25 categories per guild (Discord select menu limit)
          return value.length <= 25;
        },
        message: "Maximum 25 categories allowed per guild",
      },
    },

    // Legacy fields for backward compatibility
    forumChannelId: {
      type: String,
      required: true,
      index: true, // Index for channel-based queries
    },
    staffRoleId: {
      type: String,
      required: true,
    },
    webhookId: {
      type: String,
      required: false,
    },
    webhookToken: {
      type: String,
      required: false,
    },
    tags: {
      type: [tagsSchema],
      required: false,
    },
    inactivityWarningHours: {
      type: Number,
      default: 24,
    },
    autoCloseHours: {
      type: Number,
      default: 168, // 7 days
    },
    enableAutoClose: {
      type: Boolean,
      default: false,
    },
    enableInactivityWarning: {
      type: Boolean,
      default: false,
    },
    // Ticket numbering counter - starts at 0, incremented for each new ticket
    nextTicketNumber: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Global AI Configuration for the server
    globalAIConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      fallbackToGlobal: {
        type: Boolean,
        default: true,
      },
      systemPrompt: {
        type: String,
        required: false,
        maxlength: 2000,
      },
      preventModmailCreation: {
        type: Boolean,
        default: false,
      },
      includeFormData: {
        type: Boolean,
        default: true,
      },
      responseStyle: {
        type: String,
        enum: ["helpful", "formal", "casual"],
        default: "helpful",
      },
      maxTokens: {
        type: Number,
        default: 500,
        min: 50,
        max: 2000,
      },
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

export default model("ModmailConfig", ModmailConfig);
export type ModmailConfigType = InferSchemaType<typeof ModmailConfig>;
export type CategoryType = InferSchemaType<typeof categorySchema>;
export type FormFieldSchema = InferSchemaType<typeof formFieldSchema>;
