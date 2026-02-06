/**
 * mentionSanitizer - Utilities for sanitizing mentions in modmail messages
 *
 * Prevents @everyone/@here pings and optionally masks other mentions
 * when relaying messages between users and staff.
 */

/**
 * Mention count result
 */
export interface MentionCounts {
  everyone: number;
  here: number;
  user: number;
  role: number;
  channel: number;
  total: number;
}

/**
 * Regex patterns for different mention types
 */
const MENTION_PATTERNS = {
  everyone: /@everyone/g,
  here: /@here/g,
  user: /<@!?\d{17,19}>/g,
  role: /<@&\d{17,19}>/g,
  channel: /<#\d{17,19}>/g,
} as const;

/**
 * Zero-width space character for breaking @everyone/@here
 */
const ZERO_WIDTH_SPACE = "\u200b";

/**
 * Strip all dangerous mentions from content
 * - @everyone/@here are broken with zero-width space
 * - User/role mentions are replaced with placeholders (optional)
 *
 * @param content - The message content to sanitize
 * @param options - Sanitization options
 * @returns Sanitized content
 */
export function stripMentions(
  content: string,
  options: {
    stripUsers?: boolean;
    stripRoles?: boolean;
    stripChannels?: boolean;
  } = {},
): string {
  let sanitized = content;

  // Always break @everyone and @here with zero-width space
  sanitized = sanitized.replace(/@(everyone|here)/g, `@${ZERO_WIDTH_SPACE}$1`);

  // Optionally replace user mentions
  if (options.stripUsers) {
    sanitized = sanitized.replace(MENTION_PATTERNS.user, "[user mention]");
  }

  // Optionally replace role mentions
  if (options.stripRoles) {
    sanitized = sanitized.replace(MENTION_PATTERNS.role, "[role mention]");
  }

  // Optionally replace channel mentions
  if (options.stripChannels) {
    sanitized = sanitized.replace(MENTION_PATTERNS.channel, "[channel mention]");
  }

  return sanitized;
}

/**
 * Check if content contains any mentions
 *
 * @param content - The message content to check
 * @returns True if content contains any mentions
 */
export function hasMentions(content: string): boolean {
  // Reset regex state (they have global flag) to prevent stateful false negatives
  MENTION_PATTERNS.everyone.lastIndex = 0;
  MENTION_PATTERNS.here.lastIndex = 0;
  MENTION_PATTERNS.user.lastIndex = 0;
  MENTION_PATTERNS.role.lastIndex = 0;
  MENTION_PATTERNS.channel.lastIndex = 0;

  return (
    MENTION_PATTERNS.everyone.test(content) ||
    MENTION_PATTERNS.here.test(content) ||
    MENTION_PATTERNS.user.test(content) ||
    MENTION_PATTERNS.role.test(content) ||
    MENTION_PATTERNS.channel.test(content)
  );
}

/**
 * Check if content contains @everyone or @here
 *
 * @param content - The message content to check
 * @returns True if content contains @everyone or @here
 */
export function hasMassMentions(content: string): boolean {
  // Reset regex state (they have global flag)
  MENTION_PATTERNS.everyone.lastIndex = 0;
  MENTION_PATTERNS.here.lastIndex = 0;

  return MENTION_PATTERNS.everyone.test(content) || MENTION_PATTERNS.here.test(content);
}

/**
 * Count mentions by type in content
 *
 * @param content - The message content to analyze
 * @returns Object with counts for each mention type
 */
export function countMentions(content: string): MentionCounts {
  // Reset regex state before matching
  for (const pattern of Object.values(MENTION_PATTERNS)) {
    pattern.lastIndex = 0;
  }

  const everyone = (content.match(MENTION_PATTERNS.everyone) || []).length;
  const here = (content.match(MENTION_PATTERNS.here) || []).length;
  const user = (content.match(MENTION_PATTERNS.user) || []).length;
  const role = (content.match(MENTION_PATTERNS.role) || []).length;
  const channel = (content.match(MENTION_PATTERNS.channel) || []).length;

  return {
    everyone,
    here,
    user,
    role,
    channel,
    total: everyone + here + user + role + channel,
  };
}

/**
 * Sanitize content specifically for user-to-staff relay
 * Breaks @everyone/@here but preserves other mentions for context
 *
 * @param content - The message content from user
 * @returns Sanitized content safe for staff channel
 */
export function sanitizeForStaff(content: string): string {
  // Only break mass mentions, keep user/role/channel for context
  return stripMentions(content, {
    stripUsers: false,
    stripRoles: false,
    stripChannels: false,
  });
}

/**
 * Sanitize content specifically for staff-to-user relay
 * Breaks @everyone/@here but preserves other mentions
 *
 * @param content - The message content from staff
 * @returns Sanitized content safe for user DM
 */
export function sanitizeForUser(content: string): string {
  // Break mass mentions, but keep user/channel mentions
  // (user mentions might be intentional references)
  return stripMentions(content, {
    stripUsers: false,
    stripRoles: false,
    stripChannels: false,
  });
}

/**
 * Escape all Discord formatting in content
 * Useful for displaying raw content in embeds
 *
 * @param content - The content to escape
 * @returns Escaped content
 */
export function escapeMarkdown(content: string): string {
  return content.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/_/g, "\\_").replace(/~/g, "\\~").replace(/`/g, "\\`").replace(/\|/g, "\\|").replace(/>/g, "\\>");
}

export default {
  stripMentions,
  hasMentions,
  hasMassMentions,
  countMentions,
  sanitizeForStaff,
  sanitizeForUser,
  escapeMarkdown,
};
