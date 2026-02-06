/**
 * GuildEnv Model - Stores encrypted guild-specific environment variables
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import crypto from "crypto";

const GuildEnvSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    envKey: { type: String, required: true },
    encryptedValue: { type: String, required: true },
    setBy: { type: String, required: true },
    setAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

GuildEnvSchema.index({ guildId: 1, envKey: 1 }, { unique: true });

// Static encryption methods
GuildEnvSchema.statics.encryptValue = function (value: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

GuildEnvSchema.statics.decryptValue = function (encryptedValue: string, encryptionKey: string): string {
  const [ivHex, encrypted] = encryptedValue.split(":");
  if (!ivHex || !encrypted) throw new Error("Invalid encrypted value format");
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.scryptSync(encryptionKey, "salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

export type IGuildEnv = InferSchemaType<typeof GuildEnvSchema>;

interface IGuildEnvModel extends Model<IGuildEnv> {
  encryptValue(value: string, encryptionKey: string): string;
  decryptValue(encryptedValue: string, encryptionKey: string): string;
}

const GuildEnvModel = (mongoose.models.GuildEnv || model("GuildEnv", GuildEnvSchema)) as IGuildEnvModel;

export default GuildEnvModel;
