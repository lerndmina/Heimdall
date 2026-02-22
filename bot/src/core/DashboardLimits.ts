/**
 * Centralized Dashboard Limits
 *
 * All configurable caps for guild-level dashboard settings live here.
 * Each limit can be overridden via an environment variable; otherwise
 * the hard-coded default is used.
 *
 * These limits exist to prevent guild owners from configuring values
 * that could overwhelm the bot (e.g. unbounded queues, unlimited
 * concurrent work, or thousands of DB-backed entities per guild).
 */

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

// ── VC Transcription ──────────────────────────────────────────────────
/** Maximum value a guild owner can set for concurrent transcriptions */
export const MAX_CONCURRENT_TRANSCRIPTIONS = envInt("LIMIT_MAX_CONCURRENT_TRANSCRIPTIONS", 5);
/** Maximum value a guild owner can set for the transcription queue size (0 = unlimited not allowed when this is set) */
export const MAX_QUEUE_SIZE = envInt("LIMIT_MAX_QUEUE_SIZE", 50);

// ── Modmail ───────────────────────────────────────────────────────────
/** Maximum number of modmail categories per guild */
export const MAX_MODMAIL_CATEGORIES = envInt("LIMIT_MAX_MODMAIL_CATEGORIES", 25);
/** Maximum staff role IDs per modmail config (global + per-category) */
export const MAX_MODMAIL_STAFF_ROLES = envInt("LIMIT_MAX_MODMAIL_STAFF_ROLES", 25);
/** Maximum form fields per modmail category */
export const MAX_MODMAIL_FORM_FIELDS = envInt("LIMIT_MAX_MODMAIL_FORM_FIELDS", 10);
/** Maximum items in a bulk category update request */
export const MAX_MODMAIL_BULK_UPDATE_SIZE = envInt("LIMIT_MAX_MODMAIL_BULK_UPDATE", 100);

// ── Moderation ────────────────────────────────────────────────────────
/** Maximum automod rules per guild */
export const MAX_AUTOMOD_RULES = envInt("LIMIT_MAX_AUTOMOD_RULES", 50);
/** Maximum patterns per automod rule */
export const MAX_AUTOMOD_PATTERNS = envInt("LIMIT_MAX_AUTOMOD_PATTERNS", 50);
/** Maximum actions per automod rule */
export const MAX_AUTOMOD_ACTIONS = envInt("LIMIT_MAX_AUTOMOD_ACTIONS", 10);
/** Maximum sticky messages per guild */
export const MAX_STICKIES = envInt("LIMIT_MAX_STICKIES", 25);
/** Minimum detection delay for sticky messages (ms) */
export const MIN_STICKY_DETECTION_DELAY = envInt("LIMIT_MIN_STICKY_DETECTION_DELAY", 5_000);
/** Maximum immune/bypass roles in moderation config */
export const MAX_MODERATION_IMMUNE_ROLES = envInt("LIMIT_MAX_MODERATION_IMMUNE_ROLES", 25);
/** Maximum lock bypass roles */
export const MAX_LOCK_BYPASS_ROLES = envInt("LIMIT_MAX_LOCK_BYPASS_ROLES", 25);

// ── Tickets ───────────────────────────────────────────────────────────
/** Maximum ticket categories per guild */
export const MAX_TICKET_CATEGORIES = envInt("LIMIT_MAX_TICKET_CATEGORIES", 25);
/** Maximum ticket openers per guild */
export const MAX_TICKET_OPENERS = envInt("LIMIT_MAX_TICKET_OPENERS", 25);

// ── Suggestions ───────────────────────────────────────────────────────
/** Maximum suggestion channels per guild */
export const MAX_SUGGESTION_CHANNELS = envInt("LIMIT_MAX_SUGGESTION_CHANNELS", 10);
/** Minimum vote cooldown in seconds */
export const MIN_VOTE_COOLDOWN = envInt("LIMIT_MIN_VOTE_COOLDOWN", 10);
/** Maximum vote cooldown in seconds */
export const MAX_VOTE_COOLDOWN = envInt("LIMIT_MAX_VOTE_COOLDOWN", 300);
/** Minimum submission cooldown in seconds */
export const MIN_SUBMISSION_COOLDOWN = envInt("LIMIT_MIN_SUBMISSION_COOLDOWN", 60);
/** Maximum submission cooldown in seconds */
export const MAX_SUBMISSION_COOLDOWN = envInt("LIMIT_MAX_SUBMISSION_COOLDOWN", 7200);

// ── TempVC ────────────────────────────────────────────────────────────
/** Maximum creator channels per guild */
export const MAX_TEMPVC_CHANNELS = envInt("LIMIT_MAX_TEMPVC_CHANNELS", 10);

// ── Role Buttons ──────────────────────────────────────────────────────
/** Maximum role button panels per guild */
export const MAX_ROLEBUTTON_PANELS = envInt("LIMIT_MAX_ROLEBUTTON_PANELS", 25);

// ── Generic ───────────────────────────────────────────────────────────
/** Maximum length for a role/channel ID array field (catch-all) */
export const MAX_ID_ARRAY_LENGTH = envInt("LIMIT_MAX_ID_ARRAY_LENGTH", 50);
/** Maximum string length for generic name/title fields */
export const MAX_NAME_LENGTH = 100;
/** Maximum string length for description/template fields */
export const MAX_DESCRIPTION_LENGTH = 2000;
