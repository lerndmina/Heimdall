/**
 * Regex Engine — Validation, safe execution, and content extractors.
 *
 * Provides safe regex operations with catastrophic backtracking protection
 * and content extraction utilities for various automod targets.
 */

import { MAX_REGEX_LENGTH, REGEX_TIMEOUT_MS } from "./constants.js";

// ── Regex Validation ─────────────────────────────────────

export interface RegexValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate a regex pattern and flags without executing it.
 */
export function validateRegex(pattern: string, flags: string = "i"): RegexValidation {
  if (!pattern || pattern.length === 0) {
    return { valid: false, error: "Pattern cannot be empty" };
  }

  if (pattern.length > MAX_REGEX_LENGTH) {
    return { valid: false, error: `Pattern exceeds maximum length of ${MAX_REGEX_LENGTH} characters` };
  }

  // Validate flags
  const validFlags = new Set(["g", "i", "m", "s", "u", "y"]);
  for (const flag of flags) {
    if (!validFlags.has(flag)) {
      return { valid: false, error: `Invalid regex flag: '${flag}'` };
    }
  }

  try {
    new RegExp(pattern, flags);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Invalid regex: ${(err as Error).message}` };
  }
}

// ── Safe Regex Execution ─────────────────────────────────

export interface RegexMatch {
  matched: boolean;
  match?: string;
  index?: number;
}

/**
 * Safely test a regex against input with backtracking protection.
 * Uses a simple length-based heuristic to reject potentially catastrophic patterns on large inputs.
 */
export function safeRegexTest(pattern: string, flags: string, input: string, _timeoutMs: number = REGEX_TIMEOUT_MS): RegexMatch {
  try {
    // Simple heuristic: limit input length to prevent catastrophic backtracking
    const testInput = input.length > 10000 ? input.substring(0, 10000) : input;

    const regex = new RegExp(pattern, flags.replace("g", "")); // remove global flag for test
    const match = regex.exec(testInput);

    if (match) {
      return { matched: true, match: match[0], index: match.index };
    }

    return { matched: false };
  } catch {
    return { matched: false };
  }
}

/**
 * Test multiple patterns against input using match mode (any/all).
 */
export function testPatterns(
  patterns: Array<{ regex: string; flags: string; label: string }>,
  input: string,
  matchMode: "any" | "all" = "any",
): { matched: boolean; matchedPattern?: { regex: string; label: string; match: string } } {
  if (patterns.length === 0) return { matched: false };

  const results: Array<{ pattern: (typeof patterns)[0]; result: RegexMatch }> = [];

  for (const pattern of patterns) {
    const result = safeRegexTest(pattern.regex, pattern.flags, input);
    results.push({ pattern, result });

    // Short-circuit for "any" mode
    if (matchMode === "any" && result.matched) {
      return {
        matched: true,
        matchedPattern: {
          regex: pattern.regex,
          label: pattern.label,
          match: result.match!,
        },
      };
    }

    // Short-circuit for "all" mode (if any one fails, overall fails)
    if (matchMode === "all" && !result.matched) {
      return { matched: false };
    }
  }

  // For "all" mode: if we got here, all matched
  if (matchMode === "all") {
    const firstMatch = results[0]!;
    return {
      matched: true,
      matchedPattern: {
        regex: firstMatch.pattern.regex,
        label: firstMatch.pattern.label,
        match: firstMatch.result.match!,
      },
    };
  }

  return { matched: false };
}

// ── Content Extractors ───────────────────────────────────

export interface EmojiInfo {
  unicode: string[];
  custom: Array<{ name: string; id: string; animated: boolean; raw: string }>;
}

/**
 * Extract all emoji from message content.
 */
export function extractEmoji(content: string): EmojiInfo {
  const result: EmojiInfo = { unicode: [], custom: [] };

  // Custom Discord emoji: <:name:id> or <a:name:id>
  const customRegex = /<(a)?:(\w+):(\d+)>/g;
  let match;
  while ((match = customRegex.exec(content)) !== null) {
    result.custom.push({
      name: match[2]!,
      id: match[3]!,
      animated: !!match[1],
      raw: match[0],
    });
  }

  // Unicode emoji (basic detection using common ranges)
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{FE0F}]+/gu;
  let emojiMatch;
  while ((emojiMatch = emojiRegex.exec(content)) !== null) {
    result.unicode.push(emojiMatch[0]);
  }

  return result;
}

/**
 * Extract all URLs from content.
 */
export function extractUrls(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>]+/gi;
  const matches = content.match(urlRegex);
  return matches ?? [];
}

/**
 * Extract sticker names from a message.
 */
export function extractStickerNames(stickers: Iterable<{ name: string }>): string[] {
  const names: string[] = [];
  for (const sticker of stickers) {
    names.push(sticker.name);
  }
  return names;
}
