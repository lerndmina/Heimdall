import { BaseInteraction } from "discord.js";
import log from "./log";

// Track recent interactions to prevent duplicate processing
const recentInteractions = new Map<string, number>();
const processedInteractionIds = new Set<string>();
const INTERACTION_COOLDOWN = 2000; // 2 seconds
const INTERACTION_ID_EXPIRY = 15 * 60 * 1000; // 15 minutes (Discord's interaction token lifetime)
const CLEANUP_INTERVAL = 30000; // 30 seconds

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();

  // Clean up rate limiting entries
  for (const [key, timestamp] of recentInteractions.entries()) {
    if (now - timestamp > INTERACTION_COOLDOWN) {
      recentInteractions.delete(key);
    }
  }

  // Note: We keep interaction IDs for longer to prevent duplicate processing
  // They'll be cleaned up when Discord interactions naturally expire
}, CLEANUP_INTERVAL);

// Clean up processed interaction IDs on a longer interval
setInterval(() => {
  const currentSize = processedInteractionIds.size;
  // Clear all if it gets too large (memory management)
  if (currentSize > 10000) {
    processedInteractionIds.clear();
    log.debug(`Cleared interaction ID cache (was ${currentSize} entries)`);
  }
}, INTERACTION_ID_EXPIRY);

/**
 * Prevents the same interaction from being processed multiple times
 * @param interaction The Discord interaction
 * @returns true if interaction should be processed, false if already processed
 */
export function shouldProcessInteractionOnce(interaction: BaseInteraction): boolean {
  if (processedInteractionIds.has(interaction.id)) {
    log.debug(`Preventing duplicate processing of interaction ${interaction.id}`);
    return false;
  }

  processedInteractionIds.add(interaction.id);
  return true;
}

/**
 * Prevents rapid duplicate interactions from the same user
 * @param interaction The Discord interaction
 * @param customId Optional custom ID to include in the guard key
 * @returns true if interaction should be processed, false if it should be ignored
 */
export function shouldProcessInteraction(interaction: BaseInteraction, customId?: string): boolean {
  // First check if this exact interaction was already processed
  if (!shouldProcessInteractionOnce(interaction)) {
    return false;
  }

  // Then check for rapid duplicates from same user
  const key = `${interaction.user.id}-${interaction.type}-${customId || interaction.id}`;
  const now = Date.now();
  const lastInteraction = recentInteractions.get(key);

  if (lastInteraction && now - lastInteraction < INTERACTION_COOLDOWN) {
    log.debug(`Ignoring rapid duplicate interaction from ${interaction.user.tag}: ${key}`);
    return false;
  }

  recentInteractions.set(key, now);
  return true;
}

/**
 * Creates a throttled interaction guard for button interactions
 * @param baseCustomId The base custom ID pattern to guard against
 * @returns Guard function
 */
export function createButtonGuard(baseCustomId: string) {
  return (interaction: BaseInteraction): boolean => {
    if (!interaction.isButton() || !interaction.customId.startsWith(baseCustomId)) {
      return true;
    }

    return shouldProcessInteraction(interaction, baseCustomId);
  };
}
