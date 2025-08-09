import {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  InteractionReplyOptions,
  InteractionUpdateOptions,
  InteractionEditReplyOptions,
} from "discord.js";
import log from "./log";

type SafeInteractionResponseOptions = {
  content?: string;
  embeds?: any[];
  components?: any[];
  ephemeral?: boolean;
};

/**
 * Safely respond to a Discord interaction with proper error handling
 * Handles cases where the interaction may be expired, unknown, or already responded to
 */
export async function safeInteractionResponse(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  options: SafeInteractionResponseOptions,
  preferUpdate = false
): Promise<boolean> {
  try {
    if (!interaction.replied && !interaction.deferred) {
      // First response
      await interaction.reply({
        content: options.content,
        embeds: options.embeds,
        components: options.components,
        ephemeral: options.ephemeral ?? true,
      });
      return true;
    } else if (preferUpdate && !interaction.replied && "update" in interaction) {
      // We're deferred and it's a component interaction, try to update
      await interaction.update({
        content: options.content,
        embeds: options.embeds,
        components: options.components,
      });
      return true;
    } else if (preferUpdate && interaction.replied && "update" in interaction) {
      // Try to update existing response for component interactions
      await interaction.update({
        content: options.content,
        embeds: options.embeds,
        components: options.components,
      });
      return true;
    } else {
      // Edit the existing reply
      await interaction.editReply({
        content: options.content,
        embeds: options.embeds,
        components: options.components,
      });
      return true;
    }
  } catch (error: any) {
    // Log the specific error code for debugging
    if (error.code === 10062) {
      log.warn(`Unknown interaction error for interaction ${interaction.id} - likely expired or already handled`);
    } else if (error.code === 40060) {
      log.warn(`Interaction already acknowledged for interaction ${interaction.id}`);
    } else {
      log.error(`Failed to respond to interaction ${interaction.id}:`, error);
    }
    return false;
  }
}

/**
 * Safely respond to an interaction with an error message
 */
export async function safeErrorResponse(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  message: string = "An error occurred while processing your request."
): Promise<boolean> {
  return await safeInteractionResponse(interaction, {
    content: message,
    components: [],
    ephemeral: true,
  });
}
