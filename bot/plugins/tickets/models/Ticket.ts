/**
 * Ticket Model - Individual support tickets
 *
 * Represents an active, closed, or archived support ticket with
 * full lifecycle tracking, question responses, and transcripts.
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import { TicketStatus } from "../types/index.js";

/**
 * Ticket transcript record
 */
export interface TicketTranscript {
  transcriptId: string;
  generatedAt: Date;
  closedBy: string;
  messageCount: number;
  participantIds: string[];
  r2Key: string;
  r2Url: string;
  contentSize: number;
  dmSent: boolean;
  channelSaved: boolean;
}

const TicketTranscriptSchema = new Schema<TicketTranscript>(
  {
    transcriptId: { type: String, required: true },
    generatedAt: { type: Date, required: true, default: Date.now },
    closedBy: { type: String, required: true },
    messageCount: { type: Number, required: true },
    participantIds: { type: [String], required: true },
    r2Key: { type: String, required: true },
    r2Url: { type: String, required: true },
    contentSize: { type: Number, required: true },
    dmSent: { type: Boolean, required: true, default: false },
    channelSaved: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

/**
 * Question response (select or modal)
 */
export interface QuestionResponse {
  questionId: string;
  questionLabel: string;
  questionType: "select" | "modal";
  answer: string;
}

const QuestionResponseSchema = new Schema<QuestionResponse>(
  {
    questionId: { type: String, required: true },
    questionLabel: { type: String, required: true },
    questionType: { type: String, enum: ["select", "modal"], required: true },
    answer: { type: String, required: true },
  },
  { _id: false }
);

/**
 * Reminder state for tracking warning messages
 */
export interface ReminderState {
  warningMessageId?: string;
  warningSentAt?: Date;
}

const ReminderStateSchema = new Schema<ReminderState>(
  {
    warningMessageId: { type: String },
    warningSentAt: { type: Date },
  },
  { _id: false }
);

/**
 * Ticket Schema
 */
const TicketSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    ticketNumber: { type: Number, required: true },

    // User Information
    userId: { type: String, required: true, index: true },
    openedBy: { type: String, required: true },
    userDisplayName: { type: String, required: true },

    // Category & Questions
    categoryId: { type: String, required: true },
    categoryName: { type: String, required: true },
    questionResponses: { type: [QuestionResponseSchema], default: [] },

    // Discord Resources
    channelId: { type: String, required: true, index: true },
    customChannelName: { type: String },

    // Archival
    archivedAt: { type: Date },
    archiveChannelId: { type: String },

    // Status
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      required: true,
      default: TicketStatus.OPEN,
    },
    claimedBy: { type: String },
    claimedAt: { type: Date },

    // Transcripts
    transcripts: { type: [TicketTranscriptSchema], default: [] },

    // Metadata
    openReason: { type: String },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    closedBy: { type: String },

    // Inactivity Reminder State
    reminderExempt: { type: Boolean, default: false },
    lastActivityAt: { type: Date, default: Date.now },
    reminderState: { type: ReminderStateSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// Indexes
TicketSchema.index({ guildId: 1, status: 1 });
TicketSchema.index({ userId: 1, guildId: 1, status: 1 });
TicketSchema.index({ guildId: 1, ticketNumber: 1 }, { unique: true });

// Static methods
TicketSchema.statics.findByChannel = function (channelId: string) {
  return this.findOne({ channelId });
};

TicketSchema.statics.findActiveByGuild = function (guildId: string) {
  return this.find({
    guildId,
    status: { $in: [TicketStatus.OPEN, TicketStatus.CLAIMED] },
  });
};

TicketSchema.statics.findByUser = function (guildId: string, userId: string) {
  return this.find({ guildId, userId }).sort({ createdAt: -1 });
};

// Type inference
type ITicket = InferSchemaType<typeof TicketSchema>;

interface ITicketModel extends Model<ITicket> {
  findByChannel(channelId: string): Promise<ITicket | null>;
  findActiveByGuild(guildId: string): Promise<ITicket[]>;
  findByUser(guildId: string, userId: string): Promise<ITicket[]>;
}

// Hot-reload safe export
const Ticket = (mongoose.models.Ticket ||
  model<ITicket, ITicketModel>("Ticket", TicketSchema)) as ITicketModel;

export default Ticket;
export type { ITicket, ITicketModel };
