import { InferSchemaType, Schema, model } from "mongoose";

export interface IGuildAIContext {
  guildId: string;
  content: string;
  enabled: boolean;
  uploadedBy: {
    userId: string;
    uploadedAt: Date;
  };
  lastUpdated: Date;
  metadata: {
    characterCount: number;
    wordCount: number;
    filename?: string;
  };
  settings: {
    useBotContext: boolean;
    useCustomContext: boolean;
    priority: "bot" | "custom" | "both";
  };
}

const GuildAIContextSchema = new Schema<IGuildAIContext>(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 50000, // 50KB limit
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    uploadedBy: {
      userId: {
        type: String,
        required: true,
      },
      uploadedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      characterCount: {
        type: Number,
        required: true,
      },
      wordCount: {
        type: Number,
        required: true,
      },
      filename: {
        type: String,
        required: false,
      },
    },
    settings: {
      useBotContext: {
        type: Boolean,
        default: true,
      },
      useCustomContext: {
        type: Boolean,
        default: true,
      },
      priority: {
        type: String,
        enum: ["bot", "custom", "both"],
        default: "both",
      },
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to update metadata
GuildAIContextSchema.pre("save", function (next) {
  if (this.isModified("content")) {
    this.metadata.characterCount = this.content.length;
    this.metadata.wordCount = this.content.split(/\s+/).filter((word) => word.length > 0).length;
    this.lastUpdated = new Date();
  }
  next();
});

export default model<IGuildAIContext>("GuildAIContext", GuildAIContextSchema);

export type GuildAIContextType = InferSchemaType<typeof GuildAIContextSchema>;
