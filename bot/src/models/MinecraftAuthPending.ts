import { Schema, model, Document } from "mongoose";

export interface MinecraftAuthPendingType extends Document {
  guildId: string;
  discordId: string;
  minecraftUsername: string;
  authCode: string; // 6-digit code

  // Discord user data (captured at submission time)
  discordUsername?: string; // Discord username
  discordDisplayName?: string; // Server nickname or global display name

  // Status tracking
  status: "awaiting_connection" | "code_shown" | "code_confirmed" | "expired" | "rejected";
  createdAt: Date;
  expiresAt: Date;
  codeShownAt?: Date; // When plugin showed the code
  confirmedAt?: Date; // When user confirmed in Discord

  // Rejection data
  rejectedBy?: string; // Staff Discord ID
  rejectionReason?: string;

  // Connection data
  lastConnectionAttempt?: {
    timestamp: Date;
    ip: string;
    uuid?: string;
  };

  updatedAt: Date;
}

const MinecraftAuthPendingSchema = new Schema<MinecraftAuthPendingType>(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    discordId: {
      type: String,
      required: true,
      index: true,
    },
    minecraftUsername: {
      type: String,
      required: true,
    },
    authCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Discord user data (captured at submission time)
    discordUsername: {
      type: String,
      required: false,
    },
    discordDisplayName: {
      type: String,
      required: false,
    },

    // Status tracking
    status: {
      type: String,
      enum: ["awaiting_connection", "code_shown", "code_confirmed", "expired", "rejected"],
      default: "awaiting_connection",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    codeShownAt: {
      type: Date,
    },
    confirmedAt: {
      type: Date,
    },

    // Rejection data
    rejectedBy: {
      type: String,
    },
    rejectionReason: {
      type: String,
    },

    // Connection data
    lastConnectionAttempt: {
      timestamp: { type: Date },
      ip: { type: String },
      uuid: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
MinecraftAuthPendingSchema.index({ guildId: 1, discordId: 1 });
MinecraftAuthPendingSchema.index({ guildId: 1, minecraftUsername: 1 });
MinecraftAuthPendingSchema.index({ authCode: 1 }, { unique: true });
MinecraftAuthPendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

const MinecraftAuthPending = model<MinecraftAuthPendingType>(
  "MinecraftAuthPending",
  MinecraftAuthPendingSchema
);

export default MinecraftAuthPending;
