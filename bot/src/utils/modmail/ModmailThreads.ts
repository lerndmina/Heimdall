import { Client, Guild, User, GuildMember, ForumChannel, ThreadChannel } from "discord.js";
import { ThingGetter } from "../TinyUtils";
import { createModmailThread } from "../ModmailUtils";
import { tryCatch } from "../trycatch";
import Database from "../data/database";
import Modmail from "../../models/Modmail";
import log from "../log";
import FetchEnvs from "../FetchEnvs";

/**
 * Modmail thread operations utility
 * - Provides centralized functions for common modmail thread operations
 * - Enhanced error handling and logging
 * - Consistent cleanup and validation patterns
 */

export interface ModmailThreadResult {
  success: boolean;
  thread?: ThreadChannel;
  modmail?: any;
  dmSuccess?: boolean;
  error?: string;
}

export interface ThreadCreationOptions {
  guild: Guild;
  targetUser: User;
  targetMember: GuildMember;
  forumChannel: ForumChannel;
  modmailConfig: any;
  reason?: string;
  openedBy?: {
    type: "User" | "Staff";
    username: string;
    userId: string;
  };
  initialMessage?: string;
  forced?: boolean;
}

export interface ThreadCleanupOptions {
  thread?: ThreadChannel;
  modmail?: any;
  reason?: string;
}

/**
 * Create a new modmail thread with enhanced error handling
 */
export async function createModmailThreadSafe(
  client: Client<true>,
  options: ThreadCreationOptions
): Promise<ModmailThreadResult> {
  const { data: result, error } = await tryCatch(createModmailThread(client, options));

  if (error) {
    log.error("Failed to create modmail thread:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }

  if (!result?.success) {
    return {
      success: false,
      error: result?.error || "Failed to create modmail thread",
    };
  }

  return {
    success: true,
    thread: result.thread,
    modmail: result.modmail,
    dmSuccess: result.dmSuccess,
  };
}

/**
 * Clean up a modmail thread and database entry
 * Used when thread creation fails or needs to be rolled back
 */
export async function cleanupModmailThread(options: ThreadCleanupOptions): Promise<void> {
  const { thread, modmail, reason = "cleanup" } = options;

  // Clean up the thread
  if (thread) {
    const { error: deleteError } = await tryCatch(thread.delete());
    if (deleteError) {
      log.error(`Failed to delete thread ${thread.id} during ${reason}:`, deleteError);
    } else {
      log.info(`Successfully deleted thread ${thread.id} during ${reason}`);
    }
  }

  // Clean up the database entry
  if (modmail && modmail._id) {
    const db = new Database();
    const { error: dbDeleteError } = await tryCatch(db.deleteOne(Modmail, { _id: modmail._id }));
    if (dbDeleteError) {
      log.error(`Failed to delete modmail record ${modmail._id} during ${reason}:`, dbDeleteError);
    } else {
      log.info(`Successfully deleted modmail record ${modmail._id} during ${reason}`);
    }
  }
}

/**
 * Check if a user already has an open modmail thread
 */
export async function checkExistingModmail(
  userId: string
): Promise<{ exists: boolean; modmail?: any }> {
  const db = new Database();
  const { data: existingModmail, error } = await tryCatch(
    db.findOne(Modmail, { userId, isClosed: false })
  );

  if (error) {
    log.error("Failed to check existing modmail:", error);
    return { exists: false };
  }

  return {
    exists: !!existingModmail,
    modmail: existingModmail,
  };
}

/**
 * Get a modmail thread by thread ID
 */
export async function getModmailByThreadId(
  threadId: string,
  includeClosedThreads: boolean = false
): Promise<{ modmail?: any; error?: string }> {
  const db = new Database();
  const query = includeClosedThreads
    ? { forumThreadId: threadId }
    : { forumThreadId: threadId, isClosed: false };

  const { data: modmail, error } = await tryCatch(db.findOne(Modmail, query));

  if (error) {
    log.error("Failed to get modmail by thread ID:", error);
    return { error: "Failed to retrieve modmail information" };
  }

  return { modmail };
}

/**
 * Update modmail last activity timestamp
 */
export async function updateModmailActivity(
  userId: string,
  activity: "user" | "staff" = "user"
): Promise<{ success: boolean; error?: string }> {
  const db = new Database();
  const updateField = activity === "user" ? "lastUserActivityAt" : "lastStaffActivityAt";

  const { data: result, error } = await tryCatch(
    db.findOneAndUpdate(
      Modmail,
      { userId },
      { [updateField]: new Date() },
      { upsert: false, new: true }
    )
  );

  if (error) {
    log.error(`Failed to update modmail activity (${activity}):`, error);
    return { success: false, error: "Failed to update activity timestamp" };
  }

  return { success: true };
}

/**
 * Close a modmail thread safely
 */
export async function closeModmailThreadSafe(
  threadId: string,
  reason: string = "Thread closed",
  closedBy?: { type: "User" | "Staff"; username: string; userId: string }
): Promise<{ success: boolean; error?: string }> {
  const db = new Database();
  const env = FetchEnvs();

  // Update the modmail record to mark as closed
  const { data: modmail, error: updateError } = await tryCatch(
    db.findOneAndUpdate(
      Modmail,
      { forumThreadId: threadId },
      {
        isOpen: false,
        closedAt: new Date(),
        closeReason: reason,
        closedBy: closedBy?.userId,
      },
      { upsert: false, new: true }
    )
  );

  await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`);
  await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*userId:*`);

  if (updateError) {
    log.error("Failed to update modmail close status:", updateError);
    return { success: false, error: "Failed to update modmail status" };
  }

  if (!modmail) {
    return { success: false, error: "Modmail thread not found" };
  }

  return { success: true };
}
