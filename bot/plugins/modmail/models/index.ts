/**
 * Modmail Plugin - Models
 *
 * Re-exports all modmail-related models and types.
 */

export {
  default as Modmail,
  type IModmail,
  type IModmailModel,
  ModmailStatus,
  MessageContext,
  MessageType,
  type FormResponse,
  type ModmailMessage,
  type MessageAttachment,
  type ModmailTranscript,
  type ModmailMetrics,
} from "./Modmail.js";

export {
  default as ModmailConfig,
  type IModmailConfig,
  type IModmailConfigModel,
  ModmailFormFieldType,
  TypingIndicatorStyle,
  type FormField,
  type ModmailCategory,
  type ForumTagsConfig,
} from "./ModmailConfig.js";
