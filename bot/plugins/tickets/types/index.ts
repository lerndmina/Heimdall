/**
 * Tickets Plugin - Types and Constants
 *
 * Shared enums, constants, and type definitions for the ticket system.
 */

/**
 * Ticket status enum
 */
export enum TicketStatus {
  OPEN = "open",
  CLAIMED = "claimed",
  CLOSED = "closed",
  ARCHIVED = "archived",
}

/**
 * Category type (parent or child)
 */
export enum CategoryType {
  PARENT = "parent",
  CHILD = "child",
}

/**
 * Opener UI type
 */
export enum OpenerUIType {
  BUTTONS = "buttons",
  DROPDOWN = "dropdown",
}

/**
 * Modal question input style
 */
export enum QuestionStyle {
  SHORT = "short",
  PARAGRAPH = "paragraph",
}

/**
 * Inactivity reminder ping behavior
 */
export enum ReminderPingBehavior {
  OPENER = "opener",
  ALL = "all",
  NONE = "none",
}

/**
 * Default ticket name format
 * Available placeholders:
 * - {number} — Ticket number
 * - {openerusername} — Opener's username
 * - {claimant} — Claimant's username or empty
 * - {category} — Category name (slugified)
 */
export const DEFAULT_TICKET_NAME_FORMAT = "{number}-{openerusername}";

/**
 * Maximum questions per category (modal limit is 5)
 */
export const MAX_MODAL_QUESTIONS = 5;

/**
 * Maximum select questions per category
 */
export const MAX_SELECT_QUESTIONS = 16;

/**
 * Maximum categories per opener
 */
export const MAX_OPENER_CATEGORIES = 25;

/**
 * Default inactivity delays (in milliseconds)
 */
export const DEFAULT_WARNING_DELAY = 86400000; // 24 hours
export const DEFAULT_CLOSE_DELAY = 259200000; // 72 hours (3 days)

/**
 * Redis key prefixes for ticket-related data
 */
export const REDIS_KEYS = {
  TICKET_SESSION: "ticket:session:",
  TICKET_NUMBER: "ticket:number:",
  TICKET_CACHE: "ticket:cache:",
} as const;
