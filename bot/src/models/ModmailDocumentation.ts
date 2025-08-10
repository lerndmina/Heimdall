import mongoose, { Document, Schema } from "mongoose";

export interface IModmailDocumentation extends Document {
  guildId: string;
  categoryId?: string; // undefined for global docs
  type: "global" | "category";
  documentation: string;
  sourceUrl?: string; // original URL if imported from URL
  lastUpdated: Date;
  version: number; // for versioning docs
  learnedFrom?: {
    threadCount: number; // how many threads contributed to learned docs
    lastLearnedAt: Date;
  };
  uploadedBy?: {
    userId: string; // who uploaded/last modified the docs
    uploadedAt: Date;
  };
  metadata?: {
    characterCount: number;
    wordCount: number;
    topics?: string[]; // AI-extracted topics for better organization
  };
}

const ModmailDocumentationSchema = new Schema<IModmailDocumentation>(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    categoryId: {
      type: String,
      required: false,
      index: true,
    },
    type: {
      type: String,
      enum: ["global", "category"],
      required: true,
    },
    documentation: {
      type: String,
      required: true,
      maxlength: 50000, // Allow for substantial documentation
    },
    sourceUrl: {
      type: String,
      required: false,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    version: {
      type: Number,
      default: 1,
    },
    learnedFrom: {
      threadCount: {
        type: Number,
        default: 0,
      },
      lastLearnedAt: {
        type: Date,
        required: false,
      },
    },
    uploadedBy: {
      userId: {
        type: String,
        required: false,
      },
      uploadedAt: {
        type: Date,
        required: false,
      },
    },
    metadata: {
      characterCount: {
        type: Number,
        required: false,
      },
      wordCount: {
        type: Number,
        required: false,
      },
      topics: [
        {
          type: String,
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
ModmailDocumentationSchema.index({ guildId: 1, categoryId: 1, type: 1 }, { unique: true });
ModmailDocumentationSchema.index({ guildId: 1, type: 1 });

// Pre-save middleware to update metadata
ModmailDocumentationSchema.pre("save", function (next) {
  if (this.isModified("documentation")) {
    if (!this.metadata) {
      this.metadata = {
        characterCount: 0,
        wordCount: 0,
        topics: [],
      };
    }
    this.metadata.characterCount = this.documentation.length;
    this.metadata.wordCount = this.documentation
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    this.lastUpdated = new Date();
    this.version += 1;
  }
  next();
});

export default mongoose.model<IModmailDocumentation>(
  "ModmailDocumentation",
  ModmailDocumentationSchema
);
