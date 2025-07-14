import { InferSchemaType, Schema, model } from "mongoose";
import FetchEnvs from "../utils/FetchEnvs";

const env = FetchEnvs();

const apiKeySchema = new Schema({
  keyId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  hashedKey: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    maxlength: 50,
  },
  scopes: [
    {
      type: String,
      enum: ["modmail:read", "modmail:write", "modmail:admin", "full"],
      required: true,
    },
  ],
  createdBy: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  lastUsed: {
    type: Date,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true,
  },
  rateLimit: {
    requestsPerWindow: {
      type: Number,
      default: 100,
    },
    windowMinutes: {
      type: Number,
      default: 15,
    },
  },
});

// Compound indexes for better performance
apiKeySchema.index({ hashedKey: 1, isActive: 1 });
apiKeySchema.index({ createdBy: 1, isActive: 1 });
apiKeySchema.index({ expiresAt: 1, isActive: 1 });

export default model("ApiKey", apiKeySchema);
export type ApiKeyType = InferSchemaType<typeof apiKeySchema>;
