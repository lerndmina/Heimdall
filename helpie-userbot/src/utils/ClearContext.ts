/**
 * ClearContext - Shared logic for clearing temporary contexts
 *
 * Used by both slash command and context menu command
 */

import { ChatInputCommandInteraction, MessageContextMenuCommandInteraction } from "discord.js";
import HelpieReplies from "./HelpieReplies";
import TemporaryContextManager from "./TemporaryContextManager";
import log from "./log";

type ClearContextInteraction = ChatInputCommandInteraction | MessageContextMenuCommandInteraction;

/**
 * Clear all temporary contexts for a user
 *
 * @param interaction - The interaction to respond to
 * @param ephemeral - Whether the response should be ephemeral (default: true)
 */
export async function clearUserContext(interaction: ClearContextInteraction, ephemeral: boolean = true): Promise<any> {
  // Check if Redis is available
  if (!TemporaryContextManager.isAvailable()) {
    await HelpieReplies.error(
      interaction,
      {
        title: "Context Storage Unavailable",
        message: "The context storage system is currently unavailable. Please try again later.",
      },
      ephemeral
    );
    return;
  }

  // Show thinking emoji while processing
  await HelpieReplies.deferThinking(interaction, ephemeral);

  try {
    // Delete all temporary contexts for this user
    const deletedCount = await TemporaryContextManager.deleteAllForUser(interaction.user.id);

    if (deletedCount === 0) {
      await HelpieReplies.editWarning(interaction, {
        title: "No Context to Clear",
        message: "You don't have any temporary context stored.",
      });
      return;
    }

    await HelpieReplies.editSuccess(interaction, {
      title: "Context Cleared",
      message: `Successfully cleared ${deletedCount} temporary context${deletedCount === 1 ? "" : "s"}.`,
    });
  } catch (error: any) {
    log.error("Failed to clear temporary contexts:", error);

    await HelpieReplies.editError(interaction, {
      title: "Clear Failed",
      message: `Failed to clear temporary contexts: ${error.message || "Unknown error"}`,
    });
  }
}
