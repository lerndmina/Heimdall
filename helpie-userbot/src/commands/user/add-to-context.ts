/**
 * Add to Context - Context Menu Command
 *
 * Right-click any message to temporarily store it in Redis for use as additional context
 * in Helpie's ask feature. The message is stored with a 5-minute TTL.
 *
 * Storage Format: HelpieContext:{userId}:{messageId} -> message content
 */

import { ContextMenuCommandBuilder, ApplicationCommandType, MessageContextMenuCommandInteraction, Client, InteractionContextType } from "discord.js";
import { CommandOptions } from "../../types/commands";
import HelpieReplies from "../../utils/HelpieReplies";
import TemporaryContextManager from "../../utils/TemporaryContextManager";
import log from "../../utils/log";

export const data = new ContextMenuCommandBuilder()
  .setName("AI -> Add Context")
  .setType(ApplicationCommandType.Message)
  .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel]);

export const options: CommandOptions = {
  deleted: false,
};

export async function run(interaction: MessageContextMenuCommandInteraction, client: Client) {
  // Check if Redis is available
  if (!TemporaryContextManager.isAvailable()) {
    return HelpieReplies.error(
      interaction,
      {
        title: "Context Storage Unavailable",
        message: "The context storage system is currently unavailable. Please try again later.",
      },
      true
    );
  }

  // Get the target message
  const targetMessage = interaction.targetMessage;

  // Extract message content
  let messageContent = targetMessage.content;

  // If message has no text content, check for embeds
  if (!messageContent || messageContent.trim().length === 0) {
    if (targetMessage.embeds.length > 0) {
      const embed = targetMessage.embeds[0];
      messageContent = `${embed.title || ""}${embed.title && embed.description ? "\n\n" : ""}${embed.description || ""}`.trim();

      if (!messageContent) {
        return HelpieReplies.warning(
          interaction,
          {
            title: "No Text Content",
            message: "This message has no text content to add to context.",
          },
          true
        );
      }
    } else {
      return HelpieReplies.warning(
        interaction,
        {
          title: "No Text Content",
          message: "This message has no text content to add to context.",
        },
        true
      );
    }
  }

  // Show thinking emoji while processing
  await HelpieReplies.deferThinking(interaction, true);

  try {
    // Store message content using TemporaryContextManager
    const success = await TemporaryContextManager.store(interaction.user.id, targetMessage.id, messageContent);

    if (!success) {
      return HelpieReplies.editError(interaction, {
        title: "Storage Failed",
        message: "Failed to store message content. Please try again.",
      });
    }

    // Get character count for user feedback
    const charCount = messageContent.length;
    const truncated = charCount > 1000;
    const preview = truncated ? messageContent.substring(0, 997) + "..." : messageContent;

    await HelpieReplies.editSuccess(interaction, `Message content has been stored for 5 minutes.`);
  } catch (error: any) {
    log.error("Failed to store message context:", error);

    return HelpieReplies.editError(interaction, {
      title: "Storage Failed",
      message: `Failed to store message content: ${error.message || "Unknown error"}`,
    });
  }
}
