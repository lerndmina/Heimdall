import mongoose, { Schema, Document, InferSchemaType } from "mongoose";

// Define the categories that can be flagged for moderation (matching OpenAI's moderation categories)
export enum ModerationCategory {
  SEXUAL = "sexual",
  SEXUAL_MINORS = "sexual/minors",
  HARASSMENT = "harassment",
  HARASSMENT_THREATENING = "harassment/threatening",
  HATE = "hate",
  HATE_THREATENING = "hate/threatening",
  ILLICIT = "illicit",
  ILLICIT_VIOLENT = "illicit/violent",
  SELF_HARM = "self-harm",
  SELF_HARM_INTENT = "self-harm/intent",
  SELF_HARM_INSTRUCTIONS = "self-harm/instructions",
  VIOLENCE = "violence",
  VIOLENCE_GRAPHIC = "violence/graphic",
  OTHER = "other",
}

export enum ModerationAction {
  NONE = "none",
  REPORT = "report",
  DELETE = "delete",
  WARN = "warn",
  TIMEOUT = "timeout",
  KICK = "kick",
  BAN = "ban",
}

// Create the schema
const ModeratedChannelSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: false,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    moderationCategories: {
      type: [String],
      enum: Object.values(ModerationCategory),
      default: Object.values(ModerationCategory),
    },
    modlogChannelId: {
      type: String,
      required: false,
    },
    isGuildDefault: {
      type: Boolean,
      default: false,
      required: false,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Create a compound index for faster queries
ModeratedChannelSchema.index(
  { guildId: 1, channelId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { channelId: { $exists: true } },
  }
);

// Create an index for guild defaults
ModeratedChannelSchema.index(
  { guildId: 1, isGuildDefault: 1 },
  { unique: true, sparse: true, partialFilterExpression: { isGuildDefault: true } }
);

export default mongoose.model("ModeratedChannel", ModeratedChannelSchema);
export type ModeratedChannelType = InferSchemaType<typeof ModeratedChannelSchema>;
