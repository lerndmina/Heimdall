/**
 * TicketCategory Model - Category definitions with questions
 *
 * Supports hierarchical categories (parent/child) with select questions,
 * modal questions, and ticket creation settings.
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import {
  CategoryType,
  QuestionStyle,
  ReminderPingBehavior,
  DEFAULT_WARNING_DELAY,
  DEFAULT_CLOSE_DELAY,
} from "../types/index.js";

/**
 * Staff role configuration
 */
export interface StaffRole {
  roleId: string;
  shouldPing: boolean;
}

const StaffRoleSchema = new Schema<StaffRole>(
  {
    roleId: { type: String, required: true },
    shouldPing: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

/**
 * Select menu option
 */
export interface SelectOption {
  label: string;
  value: string;
  emoji?: string;
  description?: string;
}

const SelectOptionSchema = new Schema<SelectOption>(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    emoji: { type: String },
    description: { type: String },
  },
  { _id: false }
);

/**
 * Select menu question (pre-modal)
 */
export interface SelectQuestion {
  id: string;
  label: string;
  placeholder?: string;
  options: SelectOption[];
  required: boolean;
  order: number;
}

const SelectQuestionSchema = new Schema<SelectQuestion>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    placeholder: { type: String },
    options: {
      type: [SelectOptionSchema],
      required: true,
      validate: [(v: SelectOption[]) => v.length > 0 && v.length <= 16, "Options must be 1-16"],
    },
    required: { type: Boolean, required: true, default: false },
    order: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

/**
 * Modal text input question
 */
export interface ModalQuestion {
  id: string;
  label: string;
  style: "short" | "paragraph";
  placeholder?: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  order: number;
}

const ModalQuestionSchema = new Schema<ModalQuestion>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    style: { type: String, enum: Object.values(QuestionStyle), required: true },
    placeholder: { type: String },
    required: { type: Boolean, required: true, default: false },
    minLength: { type: Number, min: 0, max: 4000 },
    maxLength: { type: Number, min: 1, max: 4000 },
    order: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

/**
 * Inactivity reminder configuration
 */
export interface InactivityReminderConfig {
  enabled: boolean;
  warningDelay: number;
  closeDelay: number;
  pingBehavior: ReminderPingBehavior;
  checkIntervalMinutes: number;
}

const InactivityReminderSchema = new Schema<InactivityReminderConfig>(
  {
    enabled: { type: Boolean, default: true },
    warningDelay: { type: Number, default: DEFAULT_WARNING_DELAY },
    closeDelay: { type: Number, default: DEFAULT_CLOSE_DELAY },
    pingBehavior: {
      type: String,
      enum: Object.values(ReminderPingBehavior),
      default: ReminderPingBehavior.OPENER,
    },
    checkIntervalMinutes: { type: Number, default: 5, min: 1, max: 60 },
  },
  { _id: false }
);

/**
 * Ticket Category Schema
 */
const TicketCategorySchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    emoji: { type: String },

    // Hierarchy
    type: { type: String, enum: Object.values(CategoryType), required: true },
    parentId: { type: String },
    childIds: { type: [String], default: [] },

    // Questions (child categories only)
    selectQuestions: { type: [SelectQuestionSchema], default: [] },
    modalQuestions: {
      type: [ModalQuestionSchema],
      default: [],
      validate: [(v: ModalQuestion[]) => v.length <= 5, "Maximum 5 modal questions"],
    },

    // Ticket Creation (child categories only)
    discordCategoryId: { type: String },
    archiveCategoryId: { type: String },
    staffRoles: { type: [StaffRoleSchema], default: [] },

    // Ticket Naming
    ticketNameFormat: { type: String, default: "{number}-{openerusername}" },

    // Inactivity Reminder
    inactivityReminder: { type: InactivityReminderSchema, default: () => ({}) },

    // Metadata
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

// Indexes
TicketCategorySchema.index({ guildId: 1, type: 1 });
TicketCategorySchema.index({ guildId: 1, parentId: 1 });
TicketCategorySchema.index({ guildId: 1, isActive: 1 });

// Static methods
TicketCategorySchema.statics.findByGuild = function (guildId: string, type?: CategoryType) {
  const query: Record<string, unknown> = { guildId, isActive: true };
  if (type) query.type = type;
  return this.find(query);
};

TicketCategorySchema.statics.findChildren = function (parentId: string) {
  return this.find({ parentId, isActive: true });
};

// Type inference
type ITicketCategory = InferSchemaType<typeof TicketCategorySchema>;

interface ITicketCategoryModel extends Model<ITicketCategory> {
  findByGuild(guildId: string, type?: CategoryType): Promise<ITicketCategory[]>;
  findChildren(parentId: string): Promise<ITicketCategory[]>;
}

// Hot-reload safe export
const TicketCategory = (mongoose.models.TicketCategory ||
  model<ITicketCategory, ITicketCategoryModel>("TicketCategory", TicketCategorySchema)) as ITicketCategoryModel;

export default TicketCategory;
export type { ITicketCategory, ITicketCategoryModel };
