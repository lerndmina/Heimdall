/**
 * Support Core Types - Re-exports all types from models and services
 */

// Model types
export type { ISupportBan, ISupportBanModel } from "../models/SupportBan.js";
export { SupportBanType, SupportBanSystem } from "../models/SupportBan.js";

export type { IScheduledAction, IScheduledActionModel, SupportInstanceId } from "../models/ScheduledAction.js";

// Service types
export {
  SupportEventType,
  type SupportEventPayload,
  type UserInteractedPayload,
  type StaffRepliedPayload,
  type SupportClaimedPayload,
  type SupportClosedPayload,
  type SupportReopenedPayload,
  type SupportEventCallback,
} from "../services/SupportEventBus.js";
