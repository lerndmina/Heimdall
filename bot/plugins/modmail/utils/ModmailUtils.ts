/**
 * ModmailUtils - Utility functions for modmail operations
 *
 * Provides:
 * - sendMessageToBothChannels: Unified message sending to both DM and thread
 */

import type { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, User, ThreadChannel } from "discord.js";
import type { IModmail } from "../models/Modmail.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { LibAPI } from "../../lib/index.js";

/**
 * Options for sending messages to both channels
 */
export interface SendToBothOptions {
  /** Components to show in user DM */
  dmComponents?: ActionRowBuilder<ButtonBuilder>[];
  /** Components to show in staff thread */
  threadComponents?: ActionRowBuilder<ButtonBuilder>[];
  /** Plain text content for DM (optional, embed is primary) */
  dmContent?: string;
  /** Plain text content for thread (optional, embed is primary) */
  threadContent?: string;
  /** Whether to skip DM (only send to thread) */
  skipDm?: boolean;
  /** Whether to skip thread (only send to DM) */
  skipThread?: boolean;
}

/**
 * Result of sending messages to both channels
 */
export interface SendToBothResult {
  /** Whether DM was sent successfully */
  dmSuccess: boolean;
  /** Whether thread message was sent successfully */
  threadSuccess: boolean;
  /** Error message if DM failed */
  dmError?: string;
  /** Error message if thread failed */
  threadError?: string;
}

/**
 * Send a message to both the user's DM and the staff thread
 * Handles failures gracefully and returns status for both
 *
 * @param client Discord client
 * @param lib Lib API for ThingGetter
 * @param modmail The modmail document
 * @param embed The embed to send (can be different for DM vs thread)
 * @param options Additional options for components and content
 * @param logger Optional logger for debugging
 * @returns Result indicating success/failure for both channels
 */
export async function sendMessageToBothChannels(
  client: Client,
  lib: LibAPI,
  modmail: IModmail,
  embed: EmbedBuilder,
  options: SendToBothOptions = {},
  logger?: PluginLogger,
): Promise<SendToBothResult> {
  const result: SendToBothResult = {
    dmSuccess: false,
    threadSuccess: false,
  };

  // Send to user DM
  if (!options.skipDm) {
    try {
      const user = await lib.thingGetter.getUser(modmail.userId as string);
      if (user) {
        const dmPayload: any = {
          embeds: [embed],
        };

        if (options.dmContent) {
          dmPayload.content = options.dmContent;
        }

        if (options.dmComponents && options.dmComponents.length > 0) {
          dmPayload.components = options.dmComponents;
        }

        await user.send(dmPayload);
        result.dmSuccess = true;
        logger?.debug(`Sent message to DM for user ${modmail.userId}`);
      } else {
        result.dmError = "User not found";
        logger?.debug(`Could not find user ${modmail.userId} for DM`);
      }
    } catch (error) {
      result.dmError = error instanceof Error ? error.message : "Unknown error";
      logger?.debug(`Failed to send DM to user ${modmail.userId}:`, error);
    }
  } else {
    result.dmSuccess = true; // Skipped counts as success
  }

  // Send to staff thread
  if (!options.skipThread) {
    try {
      if (modmail.forumThreadId && modmail.forumThreadId !== "pending") {
        const thread = await lib.thingGetter.getChannel(modmail.forumThreadId as string);
        if (thread && thread.isThread()) {
          const threadPayload: any = {
            embeds: [embed],
          };

          if (options.threadContent) {
            threadPayload.content = options.threadContent;
          }

          if (options.threadComponents && options.threadComponents.length > 0) {
            threadPayload.components = options.threadComponents;
          }

          await (thread as ThreadChannel).send(threadPayload);
          result.threadSuccess = true;
          logger?.debug(`Sent message to thread ${modmail.forumThreadId}`);
        } else {
          result.threadError = "Thread not found or not a thread";
          logger?.debug(`Thread ${modmail.forumThreadId} not found or not a thread`);
        }
      } else {
        result.threadError = "No thread ID";
        logger?.debug(`Modmail ${modmail.modmailId} has no thread ID`);
      }
    } catch (error) {
      result.threadError = error instanceof Error ? error.message : "Unknown error";
      logger?.debug(`Failed to send message to thread ${modmail.forumThreadId}:`, error);
    }
  } else {
    result.threadSuccess = true; // Skipped counts as success
  }

  return result;
}

/**
 * Send different embeds to DM and thread (e.g., different buttons or content)
 *
 * @param client Discord client
 * @param lib Lib API for ThingGetter
 * @param modmail The modmail document
 * @param dmEmbed Embed to send to user DM
 * @param threadEmbed Embed to send to staff thread
 * @param options Additional options for components and content
 * @param logger Optional logger for debugging
 * @returns Result indicating success/failure for both channels
 */
export async function sendDifferentMessagesToBothChannels(
  client: Client,
  lib: LibAPI,
  modmail: IModmail,
  dmEmbed: EmbedBuilder,
  threadEmbed: EmbedBuilder,
  options: SendToBothOptions = {},
  logger?: PluginLogger,
): Promise<SendToBothResult> {
  const result: SendToBothResult = {
    dmSuccess: false,
    threadSuccess: false,
  };

  // Send to user DM
  if (!options.skipDm) {
    try {
      const user = await lib.thingGetter.getUser(modmail.userId as string);
      if (user) {
        const dmPayload: any = {
          embeds: [dmEmbed],
        };

        if (options.dmContent) {
          dmPayload.content = options.dmContent;
        }

        if (options.dmComponents && options.dmComponents.length > 0) {
          dmPayload.components = options.dmComponents;
        }

        await user.send(dmPayload);
        result.dmSuccess = true;
        logger?.debug(`Sent message to DM for user ${modmail.userId}`);
      } else {
        result.dmError = "User not found";
      }
    } catch (error) {
      result.dmError = error instanceof Error ? error.message : "Unknown error";
      logger?.debug(`Failed to send DM to user ${modmail.userId}:`, error);
    }
  } else {
    result.dmSuccess = true;
  }

  // Send to staff thread
  if (!options.skipThread) {
    try {
      if (modmail.forumThreadId && modmail.forumThreadId !== "pending") {
        const thread = await lib.thingGetter.getChannel(modmail.forumThreadId as string);
        if (thread && thread.isThread()) {
          const threadPayload: any = {
            embeds: [threadEmbed],
          };

          if (options.threadContent) {
            threadPayload.content = options.threadContent;
          }

          if (options.threadComponents && options.threadComponents.length > 0) {
            threadPayload.components = options.threadComponents;
          }

          await (thread as ThreadChannel).send(threadPayload);
          result.threadSuccess = true;
          logger?.debug(`Sent message to thread ${modmail.forumThreadId}`);
        } else {
          result.threadError = "Thread not found";
        }
      } else {
        result.threadError = "No thread ID";
      }
    } catch (error) {
      result.threadError = error instanceof Error ? error.message : "Unknown error";
      logger?.debug(`Failed to send message to thread ${modmail.forumThreadId}:`, error);
    }
  } else {
    result.threadSuccess = true;
  }

  return result;
}

export default {
  sendMessageToBothChannels,
  sendDifferentMessagesToBothChannels,
};
