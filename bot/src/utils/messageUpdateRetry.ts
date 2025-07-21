import { Message } from "discord.js";
import log from "./log";
import { tryCatch } from "./trycatch";

interface MessageUpdateOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

/**
 * Retry message updates with exponential backoff
 * Useful for handling Discord rate limits and temporary failures
 */
export async function retryMessageUpdate(
  message: Message,
  updateData: any,
  options: MessageUpdateOptions = {}
): Promise<boolean> {
  const { maxRetries = 5, baseDelay = 1000, maxDelay = 30000, backoffMultiplier = 2 } = options;

  let delay = baseDelay;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { error } = await tryCatch(message.edit(updateData));

    if (!error) {
      if (attempt > 0) {
        log.debug(`Message update succeeded on attempt ${attempt + 1}`);
      }
      return true;
    }

    // Handle specific Discord errors
    if ((error as any).code === 10008) {
      // Message not found - can't recover
      log.error("Message no longer exists, cannot update");
      return false;
    }

    if ((error as any).code === 50001) {
      // Missing permissions - can't recover
      log.error("Missing permissions to edit message");
      return false;
    }

    if (attempt === maxRetries - 1) {
      // Last attempt failed
      log.error(`Message update failed after ${maxRetries} attempts:`, error);
      return false;
    }

    // Rate limited or other recoverable error
    log.warn(
      `Message update attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
      error.message
    );
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Exponential backoff with max delay cap
    delay = Math.min(delay * backoffMultiplier, maxDelay);
  }

  return false;
}

/**
 * Queue message updates to prevent overwhelming Discord's API
 */
class MessageUpdateQueue {
  private queue: Map<string, Promise<boolean>> = new Map();

  async queueUpdate(messageId: string, updateFn: () => Promise<boolean>): Promise<boolean> {
    // If there's already a pending update for this message, wait for it
    const existingUpdate = this.queue.get(messageId);
    if (existingUpdate) {
      log.debug(`Waiting for existing update to complete for message ${messageId}`);
      await existingUpdate;
    }

    // Queue the new update
    const updatePromise = updateFn().finally(() => {
      this.queue.delete(messageId);
    });

    this.queue.set(messageId, updatePromise);
    return updatePromise;
  }
}

export const messageUpdateQueue = new MessageUpdateQueue();
