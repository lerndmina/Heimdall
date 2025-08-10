import { Client, Guild, User, GuildMember, ForumChannel, ThreadChannel, Message } from "discord.js";
import { ThingGetter } from "../TinyUtils";
import { createModmailThread } from "../ModmailUtils";
import { tryCatch } from "../trycatch";
import Database from "../data/database";
import Modmail from "../../models/Modmail";
import ModmailConfig from "../../models/ModmailConfig";
import log from "../log";
import FetchEnvs from "../FetchEnvs";
import ModmailCache from "../ModmailCache";
import { hookManager } from "../hooks/HookManager";
import { HookType, AfterClosingHookContext } from "../hooks/HookTypes";

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

export interface CloseModmailOptions {
  threadId?: string;
  modmailId?: string;
  reason?: string;
  closedBy?: {
    type: "User" | "Staff" | "System";
    username: string;
    userId: string;
  };
  lockAndArchive?: boolean;
  sendCloseMessage?: boolean;
  updateTags?: boolean;
}

export interface CloseModmailResult {
  success: boolean;
  modmail?: any;
  error?: string;
}

/**
 * Close a modmail thread safely with full functionality
 * - Updates database record
 * - Cleans cache
 * - Optionally locks and archives thread
 * - Optionally sends close message
 * - Optionally updates thread tags
 */
export async function closeModmailThreadSafe(
  client: Client<true>,
  options: CloseModmailOptions
): Promise<CloseModmailResult> {
  const {
    threadId,
    modmailId,
    reason = "Thread closed",
    closedBy,
    lockAndArchive = true,
    sendCloseMessage = true,
    updateTags = true,
  } = options;

  const db = new Database();
  const env = FetchEnvs();
  const getter = new ThingGetter(client);

  try {
    // Find the modmail record
    let query: any;
    if (threadId) {
      query = { forumThreadId: threadId };
    } else if (modmailId) {
      query = { _id: modmailId };
    } else {
      return { success: false, error: "Either threadId or modmailId must be provided" };
    }

    const { data: modmail, error: findError } = await tryCatch(db.findOne(Modmail, query));

    if (findError) {
      log.error("Failed to find modmail record:", findError);
      return { success: false, error: "Failed to find modmail record" };
    }

    if (!modmail) {
      return { success: false, error: "Modmail thread not found" };
    }

    // Send close message if requested
    if (sendCloseMessage) {
      const { sendModmailCloseMessage } = await import("../ModmailUtils");
      const { error: closeMessageError } = await tryCatch(
        sendModmailCloseMessage(
          client,
          modmail,
          closedBy?.type || "System",
          closedBy?.username || "System",
          reason
        )
      );

      if (closeMessageError) {
        log.warn("Failed to send close message:", closeMessageError);
        // Continue with closing process even if message fails
      }
    }

    // Get thread for locking/archiving and tag updates
    let forumThread: ThreadChannel | null = null;
    if (lockAndArchive || updateTags) {
      const { data: thread, error: threadError } = await tryCatch(
        getter.getChannel(modmail.forumThreadId)
      );

      if (threadError) {
        log.warn("Failed to get forum thread:", threadError);
      } else if (thread && "setLocked" in thread) {
        forumThread = thread as ThreadChannel;
      }
    }

    // Update thread tags if requested
    if (updateTags && forumThread) {
      const { data: config, error: configError } = await tryCatch(
        ModmailCache.getModmailConfig(modmail.guildId, db)
      );

      if (configError) {
        log.warn("Failed to get modmail config for tag update:", configError);
      } else if (config) {
        const { data: forumChannel, error: forumChannelError } = await tryCatch(
          getter.getChannel(config.forumChannelId)
        );

        if (forumChannelError) {
          log.warn("Failed to get forum channel for tag update:", forumChannelError);
        } else if (forumChannel) {
          const { handleTag } = await import("../../events/messageCreate/gotMail");
          const { error: tagError } = await tryCatch(
            handleTag(null, config, db, forumThread, forumChannel as ForumChannel)
          );

          if (tagError) {
            log.warn("Failed to update thread tags:", tagError);
          }
        }
      }
    }

    // Lock and archive thread if requested
    if (lockAndArchive && forumThread) {
      const archiveReason = `${closedBy?.type || "System"} closed: ${reason}`;

      const { error: lockError } = await tryCatch(forumThread.setLocked(true, archiveReason));
      if (lockError) {
        log.warn("Failed to lock thread:", lockError);
      }

      const { error: archiveError } = await tryCatch(forumThread.setArchived(true, archiveReason));
      if (archiveError) {
        log.warn("Failed to archive thread:", archiveError);
        // Send a message to the thread if we can't archive it
        const { error: notificationError } = await tryCatch(
          forumThread.send(
            "⚠️ **Manual Action Required**\n\nFailed to archive and lock thread automatically. Please do so manually.\nI'm probably missing permissions."
          )
        );
        if (notificationError) {
          log.error("Failed to send manual action notification:", notificationError);
        }
      }
    }

    // Update the modmail record to mark as closed
    const { data: updatedModmail, error: updateError } = await tryCatch(
      db.findOneAndUpdate(
        Modmail,
        query,
        {
          isClosed: true,
          closedAt: new Date(),
          closeReason: reason,
          closedBy: closedBy?.userId || "system",
        },
        { upsert: false, new: true }
      )
    );

    if (updateError) {
      log.error("Failed to update modmail close status:", updateError);
      return { success: false, error: "Failed to update modmail status" };
    }

    // Clean cache
    const { error: cacheError1 } = await tryCatch(
      db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`)
    );
    const { error: cacheError2 } = await tryCatch(
      db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*userId:*`)
    );

    if (cacheError1 || cacheError2) {
      log.warn("Failed to clean cache:", cacheError1 || cacheError2);
    }

    log.info(
      `Modmail ${(modmail as any)._id} closed by ${closedBy?.type || "System"} (${
        closedBy?.username || "System"
      }) with reason: ${reason}`
    );

    // Execute after-closing hooks
    await executeAfterClosingHooks(client, modmail, closedBy, reason, forumThread);

    return { success: true, modmail: updatedModmail };
  } catch (error) {
    log.error("Unexpected error in closeModmailThreadSafe:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Execute after-closing hooks for a modmail thread
 */
async function executeAfterClosingHooks(
  client: Client<true>,
  modmail: any,
  closedBy?: { type: "User" | "Staff" | "System"; username: string; userId: string },
  reason?: string,
  forumThread?: ThreadChannel | null
): Promise<void> {
  try {
    if (!forumThread) {
      log.debug("No forum thread available for after-closing hooks");
      return;
    }

    // Get the guild and user
    const guild = forumThread.guild;
    const getter = new ThingGetter(client);

    // Try to get the user
    const { data: user } = await tryCatch(getter.getUser(modmail.userId));
    if (!user) {
      log.debug("Could not get user for after-closing hooks");
      return;
    }

    // Generate transcript data
    const transcript = await generateTranscriptData(forumThread, modmail);
    if (!transcript) {
      log.debug("Could not generate transcript for after-closing hooks");
      return;
    }

    // Get the correct category ID from modmail config
    // forumThread.parentId is the Discord forum channel ID, but we need the modmail category ID
    let categoryId = "";
    try {
      const db = new Database();
      const config = await db.findOne(ModmailConfig, { guildId: guild.id });
      if (config) {
        // Check if it's the default category (uses legacy forumChannelId)
        if (config.forumChannelId === forumThread.parentId && config.defaultCategory) {
          categoryId = config.defaultCategory.id;
        } else {
          // Check additional categories
          const category = config.categories?.find(
            (cat: any) => cat.forumChannelId === forumThread.parentId
          );
          if (category) {
            categoryId = category.id;
          }
        }
      }
    } catch (error) {
      log.error("Error looking up category ID for learning:", error);
    }

    // Fallback to forum channel ID if we couldn't find the category
    if (!categoryId) {
      categoryId = forumThread.parentId || "";
      log.warn(
        `Could not find modmail category ID for forum channel ${forumThread.parentId}, using forum channel ID as fallback`
      );
    }

    // Create the hook context
    const hookContext: AfterClosingHookContext = {
      client,
      user,
      guild,
      originalMessage: {} as Message, // We don't have the original message in this context
      hookType: HookType.AFTER_CLOSING,
      requestId: `close-${modmail._id}-${Date.now()}`,
      modmailId: modmail._id.toString(),
      closingReason: reason,
      closedBy: user, // This might not be accurate, but it's the best we have
      forceClose: false,
      threadId: forumThread.id,
      categoryId,
      transcript,
    };

    // Execute the hooks
    await hookManager.executeHooks(HookType.AFTER_CLOSING, hookContext);
  } catch (error) {
    log.error("Error executing after-closing hooks:", error);
    // Don't throw - hooks are optional and shouldn't break the closing process
  }
}

/**
 * Generate transcript data from a forum thread
 */
async function generateTranscriptData(
  forumThread: ThreadChannel,
  modmail: any
): Promise<{
  messages: Array<{
    authorId: string;
    authorName: string;
    content: string;
    timestamp: Date;
    isStaff: boolean;
  }>;
  openedAt: Date;
  closedAt: Date;
  duration: number;
} | null> {
  try {
    const messages: Array<{
      authorId: string;
      authorName: string;
      content: string;
      timestamp: Date;
      isStaff: boolean;
    }> = [];

    // Fetch messages from the thread
    const threadMessages = await forumThread.messages.fetch({ limit: 100 });

    for (const [, message] of threadMessages) {
      // Skip system messages and bot messages (except if they contain user content)
      if (message.author.system || message.webhookId) continue;

      // Check if the author is staff (has manage messages permission)
      const isStaff = message.member?.permissions.has("ManageMessages") || false;

      messages.push({
        authorId: message.author.id,
        authorName: message.author.displayName || message.author.username,
        content: message.content,
        timestamp: message.createdAt,
        isStaff,
      });
    }

    // Sort messages by timestamp (oldest first)
    messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const openedAt = modmail.createdAt || new Date();
    const closedAt = new Date();
    const duration = Math.round((closedAt.getTime() - openedAt.getTime()) / (1000 * 60)); // in minutes

    return {
      messages,
      openedAt,
      closedAt,
      duration,
    };
  } catch (error) {
    log.error("Error generating transcript data:", error);
    return null;
  }
}

/**
 * @deprecated Use closeModmailThreadSafe with CloseModmailOptions instead
 * Legacy function for backward compatibility
 */
export async function closeModmailThreadSafeLegacy(
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
        isClosed: true,
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
