/**
 * Suggestion Validation Utility
 * Helper functions for validating suggestion-related actions
 */

import type { RedisClientType } from "redis";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("suggestions:validation");

export interface CooldownResult {
  canProceed: boolean;
  remainingTime?: number;
}

/** Check if user can submit a suggestion (cooldown check) */
export async function canUserSubmitSuggestion(userId: string, guildId: string, redis: RedisClientType | null, cooldownSeconds: number = 3600): Promise<CooldownResult> {
  if (!redis) {
    log.warn("Redis not available, skipping submission cooldown check");
    return { canProceed: true };
  }

  const key = `suggestionSubmit:${userId}:${guildId}`;
  const exists = await redis.exists(key);

  if (exists) {
    const ttl = await redis.ttl(key);
    return { canProceed: false, remainingTime: ttl > 0 ? ttl : cooldownSeconds };
  }

  return { canProceed: true };
}

/** Set submission cooldown for user */
export async function setSubmissionCooldown(userId: string, guildId: string, redis: RedisClientType | null, cooldownSeconds: number = 3600): Promise<void> {
  if (!redis) return;
  const key = `suggestionSubmit:${userId}:${guildId}`;
  await redis.set(key, "1", { EX: cooldownSeconds });
}

/** Check if user can vote (cooldown check) */
export async function canUserVote(userId: string, suggestionId: string, redis: RedisClientType | null, cooldownSeconds: number = 60): Promise<CooldownResult> {
  if (!redis) {
    log.warn("Redis not available, skipping vote cooldown check");
    return { canProceed: true };
  }

  const key = `suggestionVote:${userId}:${suggestionId}`;
  const exists = await redis.exists(key);

  if (exists) {
    const ttl = await redis.ttl(key);
    return { canProceed: false, remainingTime: ttl > 0 ? ttl : cooldownSeconds };
  }

  return { canProceed: true };
}

/** Set vote cooldown for user */
export async function setVoteCooldown(userId: string, suggestionId: string, redis: RedisClientType | null, cooldownSeconds: number = 60): Promise<void> {
  if (!redis) return;
  const key = `suggestionVote:${userId}:${suggestionId}`;
  await redis.set(key, "1", { EX: cooldownSeconds });
}

/** Format time remaining for user display */
export function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    if (remainingSeconds === 0) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    return `${minutes} minute${minutes !== 1 ? "s" : ""} and ${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
  return `${hours} hour${hours !== 1 ? "s" : ""} and ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`;
}
