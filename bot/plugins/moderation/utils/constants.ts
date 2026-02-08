/**
 * Shared constants for the moderation plugin.
 */

/** Maximum number of messages that can be purged in a single operation */
export const PURGE_MAX_MESSAGES = 200;

/** Maximum age of messages for bulk delete (14 days in ms) */
export const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Discord's maximum timeout duration (28 days in ms) */
export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

/** Default regex execution timeout in ms */
export const REGEX_TIMEOUT_MS = 100;

/** Maximum regex pattern length */
export const MAX_REGEX_LENGTH = 500;

/** Redis cache TTL for moderation config (5 minutes) */
export const CONFIG_CACHE_TTL = 300;

/** Redis cache TTL for automod rules (5 minutes) */
export const RULES_CACHE_TTL = 300;

/** Redis key prefixes */
export const CACHE_KEYS = {
  CONFIG: "moderation:config",
  RULES: "moderation:rules",
} as const;

/** Default DM template */
export const DEFAULT_DM_TEMPLATE = "You have received a moderation action in **{server}**.\n\n" + "**Action:** {action}\n" + "**Reason:** {reason}\n" + "**Points:** {points} (Total: {totalPoints})";

/** Embed colors for different action types */
export const ACTION_COLORS = {
  warn: 0xeab308,
  kick: 0xf97316,
  ban: 0xef4444,
  mute: 0x8b5cf6,
  unban: 0x22c55e,
  automod: 0x3b82f6,
  escalation: 0xdc2626,
  purge: 0x6366f1,
  infraction: 0x64748b,
} as const;
