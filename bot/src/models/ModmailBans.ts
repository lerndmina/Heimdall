import { InferSchemaType, Schema, model } from "mongoose";

// Define the base ban fields as an object
const baseBanFields = {
  userId: { type: String, required: true },
  bannedBy: { type: String, required: true },
  reason: { type: String, required: true },
  duration: { type: Number, required: false },
  permanent: { type: Boolean, default: false },
  bannedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: false },
  unbanned: { type: Boolean, default: false },
  unbannedAt: { type: Date, required: false },
  unbannedBy: { type: String, required: false },
  unbannedReason: { type: String, required: false },
};

// Create the ModmailBan schema by spreading in the base ban fields,
// and add previousBans as an array of BaseBanSchema.
const ModmailBanSchema = new Schema({
  guildId: { type: String, required: true },
  ...baseBanFields,
  previousBans: { type: [baseBanFields], default: [], required: false },
});

// Create the model
const ModmailBanModel = model("ModmailBan", ModmailBanSchema);

// Adjust the inferred type to mark some fields as optional
export type ModmailBanType = Omit<
  InferSchemaType<typeof ModmailBanSchema>,
  "expiresAt" | "unbannedAt" | "unbannedBy" | "unbannedReason" | "unbanned" | "duration"
> & {
  expiresAt?: Date;
  unbannedAt?: Date;
  unbannedBy?: string;
  unbannedReason?: string;
  unbanned?: boolean;
  duration?: number;
};

export type BanDisplayType = {
  bannedAt: Date;
  bannedBy: string;
  reason: string;
  permanent: boolean;
  expiresAt?: Date;
};

export default ModmailBanModel;
