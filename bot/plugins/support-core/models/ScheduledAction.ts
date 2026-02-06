/**
 * ScheduledAction Model - Persistent timers and callbacks for universal support system
 *
 * Handles scheduled actions like auto-resolve, reminders, follow-ups that need to
 * survive bot restarts. Processed by cron job every minute.
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import { nanoid } from "nanoid";

// Support instance ID types from unified system
export type SupportInstanceId = `ticket:${string}` | `modmail:${string}`;

const ScheduledActionSchema = new Schema({
  // Unique identifier for this scheduled action
  actionId: {
    type: String,
    required: true,
    unique: true,
    default: () => nanoid(16),
    index: true,
  },

  // Support instance this action belongs to
  supportInstanceId: {
    type: String,
    required: true,
    index: true,
  },

  // Guild context
  guildId: {
    type: String,
    required: true,
    index: true,
  },

  // Hook that scheduled this action
  hookId: {
    type: String,
    required: true,
    index: true,
  },

  // Action type (auto_resolve, reminder, etc.)
  action: {
    type: String,
    required: true,
  },

  // When to execute this action
  executeAt: {
    type: Date,
    required: true,
    index: true, // Important for cron queries
  },

  // Optional data for the action
  payload: {
    type: Schema.Types.Mixed,
    required: false,
  },

  // Processing status
  processed: {
    type: Boolean,
    default: false,
    index: true,
  },

  // When it was processed (if processed)
  processedAt: {
    type: Date,
    required: false,
  },

  // Error info if processing failed
  error: {
    type: String,
    required: false,
  },

  // Retry count for failed actions
  retryCount: {
    type: Number,
    default: 0,
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound indexes for efficient queries
ScheduledActionSchema.index({ executeAt: 1, processed: 1 }); // Cron processing
ScheduledActionSchema.index({ supportInstanceId: 1, processed: 1 }); // Support instance cleanup
ScheduledActionSchema.index({ guildId: 1, hookId: 1 }); // Guild hook queries

// ==================== STATIC METHODS ====================

/**
 * Find actions that are due for processing
 */
ScheduledActionSchema.statics.findDueActions = function (limit: number = 100) {
  return this.find({
    executeAt: { $lte: new Date() },
    processed: false,
  })
    .sort({ executeAt: 1 })
    .limit(limit);
};

/**
 * Cancel all actions for a support instance
 */
ScheduledActionSchema.statics.cancelBySupport = function (supportInstanceId: SupportInstanceId) {
  return this.updateMany({ supportInstanceId, processed: false }, { processed: true, processedAt: new Date(), error: "Support instance closed" });
};

/**
 * Cancel all actions for a specific hook on a support instance
 */
ScheduledActionSchema.statics.cancelByHook = function (supportInstanceId: SupportInstanceId, hookId: string) {
  return this.updateMany({ supportInstanceId, hookId, processed: false }, { processed: true, processedAt: new Date(), error: "Cancelled by hook" });
};

// ==================== TYPE INFERENCE ====================

type IScheduledActionBase = InferSchemaType<typeof ScheduledActionSchema>;

export interface IScheduledAction extends IScheduledActionBase {
  _id: mongoose.Types.ObjectId;
}

export interface IScheduledActionModel extends Model<IScheduledAction> {
  findDueActions(limit?: number): Promise<IScheduledAction[]>;
  cancelBySupport(supportInstanceId: SupportInstanceId): Promise<mongoose.UpdateWriteOpResult>;
  cancelByHook(supportInstanceId: SupportInstanceId, hookId: string): Promise<mongoose.UpdateWriteOpResult>;
}

// ==================== MODEL EXPORT ====================

/**
 * Hot-reload safe model export
 */
const ScheduledAction = (mongoose.models.ScheduledAction || model<IScheduledAction, IScheduledActionModel>("ScheduledAction", ScheduledActionSchema)) as IScheduledActionModel;

export default ScheduledAction;
