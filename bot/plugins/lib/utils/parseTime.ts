import * as chrono from "chrono-node";

export interface ParseTimeResult {
  /** The parsed date */
  date: Date;
  /** Milliseconds from now until the date */
  ms: number;
  /** Whether the date is in the past */
  isPast: boolean;
  /** Human-readable relative time string */
  relative: string;
}

/**
 * Parse a natural language time string into a Date
 *
 * @example
 * parseTime("in 5 minutes")  // { date: Date, ms: 300000, isPast: false, relative: "in 5 minutes" }
 * parseTime("tomorrow at 3pm")
 * parseTime("next friday")
 * parseTime("2 hours ago")  // { date: Date, ms: -7200000, isPast: true, relative: "2 hours ago" }
 */
export function parseTime(input: string, referenceDate?: Date): ParseTimeResult | null {
  const ref = referenceDate ?? new Date();
  const results = chrono.parse(input, ref, { forwardDate: true });

  if (results.length === 0) {
    return null;
  }

  const result = results[0]!;
  const date = result.start.date();
  const now = new Date();
  const ms = date.getTime() - now.getTime();
  const isPast = ms < 0;

  return {
    date,
    ms,
    isPast,
    relative: formatRelative(ms),
  };
}

/**
 * Parse a duration string like "5m", "2h30m", "1d" into milliseconds
 */
export function parseDuration(input: string): number | null {
  const regex = /(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)/gi;
  let totalMs = 0;
  let match;

  while ((match = regex.exec(input)) !== null) {
    const valueStr = match[1];
    const unitStr = match[2];
    if (!valueStr || !unitStr) continue;

    const value = parseInt(valueStr, 10);
    const unit = unitStr.toLowerCase();

    switch (unit) {
      case "s":
      case "sec":
      case "second":
      case "seconds":
        totalMs += value * 1000;
        break;
      case "m":
      case "min":
      case "minute":
      case "minutes":
        totalMs += value * 60 * 1000;
        break;
      case "h":
      case "hr":
      case "hour":
      case "hours":
        totalMs += value * 60 * 60 * 1000;
        break;
      case "d":
      case "day":
      case "days":
        totalMs += value * 24 * 60 * 60 * 1000;
        break;
      case "w":
      case "week":
      case "weeks":
        totalMs += value * 7 * 24 * 60 * 60 * 1000;
        break;
    }
  }

  return totalMs > 0 ? totalMs : null;
}

function formatRelative(ms: number): string {
  const absMs = Math.abs(ms);
  const isPast = ms < 0;

  const seconds = Math.floor(absMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let relative: string;

  if (days > 0) {
    relative = `${days} day${days !== 1 ? "s" : ""}`;
  } else if (hours > 0) {
    relative = `${hours} hour${hours !== 1 ? "s" : ""}`;
  } else if (minutes > 0) {
    relative = `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  } else {
    relative = `${seconds} second${seconds !== 1 ? "s" : ""}`;
  }

  return isPast ? `${relative} ago` : `in ${relative}`;
}
