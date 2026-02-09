/**
 * Wildcard Pattern Converter — Discord AutoMod–style wildcard matching.
 *
 * Converts simple wildcard patterns (using `*` as a wildcard) into regex
 * patterns that the automod engine can execute. This makes rule creation
 * intuitive for non-technical users.
 *
 * ## Pattern Rules
 *
 * - `word`    → matches the exact word (word boundary on both sides)
 * - `*word`   → matches anything ending with "word" (e.g. "sword")
 * - `word*`   → matches anything starting with "word" (e.g. "wording")
 * - `*word*`  → matches "word" anywhere in text (e.g. "swordfight")
 * - `*w*rd`   → the inner `*` matches any characters (e.g. "word", "ward", "weird")
 * - Multiple patterns separated by commas: `*m*m,d*d`
 *
 * All matching is case-insensitive.
 */

// ── Types ────────────────────────────────────────────────

export interface WildcardConversion {
  /** Original wildcard pattern */
  wildcard: string;
  /** Generated regex string */
  regex: string;
  /** Regex flags */
  flags: string;
  /** Human-readable label */
  label: string;
}

export interface WildcardParseResult {
  success: boolean;
  patterns: WildcardConversion[];
  errors: string[];
}

// ── Core Converter ───────────────────────────────────────

/**
 * Escape all regex special characters except `*` which is our wildcard.
 */
function escapeRegexExceptWildcard(str: string): string {
  return str.replace(/[-[\]{}()+?.\\^$|#\s]/g, "\\$&");
}

/**
 * Convert a single wildcard pattern to a regex string.
 *
 * `*` becomes `\\S*` (matches any non-whitespace characters).
 * Word boundaries are added when the pattern does not start/end with `*`.
 */
export function wildcardToRegex(wildcard: string): string {
  const trimmed = wildcard.trim();
  if (!trimmed) return "";

  const startsWithWild = trimmed.startsWith("*");
  const endsWithWild = trimmed.endsWith("*");

  // Strip leading/trailing wildcards for processing
  let core = trimmed;
  if (startsWithWild) core = core.substring(1);
  if (endsWithWild) core = core.substring(0, core.length - 1);

  // Escape regex-special chars, then replace inner `*` with `\\S*`
  const escaped = escapeRegexExceptWildcard(core).replace(/\*/g, "\\S*");

  // Build final pattern with appropriate anchors
  const prefix = startsWithWild ? "\\S*" : "\\b";
  const suffix = endsWithWild ? "\\S*" : "\\b";

  return `${prefix}${escaped}${suffix}`;
}

/**
 * Generate a human-readable label explaining what a wildcard pattern matches.
 */
function describeWildcard(pattern: string): string {
  const trimmed = pattern.trim();
  const startsWithWild = trimmed.startsWith("*");
  const endsWithWild = trimmed.endsWith("*");
  const core = trimmed.replace(/^\*|\*$/g, "");

  if (startsWithWild && endsWithWild) return `Contains "${core}"`;
  if (startsWithWild) return `Ends with "${core}"`;
  if (endsWithWild) return `Starts with "${core}"`;
  return `Exact word "${core}"`;
}

/**
 * Parse a comma-separated wildcard string into an array of regex patterns.
 *
 * Input: `"*m*m, d*d, exact"`
 * Output: Array of WildcardConversion objects ready for the automod engine.
 */
export function parseWildcardPatterns(input: string): WildcardParseResult {
  const errors: string[] = [];
  const patterns: WildcardConversion[] = [];

  // Split by comma, trim whitespace, filter empties
  const wildcards = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (wildcards.length === 0) {
    return { success: false, patterns: [], errors: ["No patterns provided"] };
  }

  for (const wc of wildcards) {
    // Validate: must contain at least one non-wildcard character
    const stripped = wc.replace(/\*/g, "");
    if (stripped.length === 0) {
      errors.push(`Pattern "${wc}" must contain at least one non-wildcard character`);
      continue;
    }

    // Validate: pattern cannot be a single character (too broad)
    if (stripped.length < 2 && !wc.includes("*")) {
      errors.push(`Pattern "${wc}" is too short — use at least 2 characters`);
      continue;
    }

    const regex = wildcardToRegex(wc);

    // Validate the generated regex actually compiles
    try {
      new RegExp(regex, "i");
    } catch (err) {
      errors.push(`Pattern "${wc}" generated invalid regex: ${(err as Error).message}`);
      continue;
    }

    patterns.push({
      wildcard: wc,
      regex,
      flags: "i",
      label: describeWildcard(wc),
    });
  }

  return {
    success: errors.length === 0 && patterns.length > 0,
    patterns,
    errors,
  };
}

/**
 * Test a wildcard pattern against sample text. Returns true if matched.
 * Useful for live preview in the dashboard.
 */
export function testWildcard(wildcard: string, text: string): boolean {
  const regex = wildcardToRegex(wildcard);
  if (!regex) return false;

  try {
    return new RegExp(regex, "i").test(text);
  } catch {
    return false;
  }
}
