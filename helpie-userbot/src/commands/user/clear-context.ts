/**
 * Clear Context - Context Menu Command
 *
 * Right-click any message to clear all your temporary stored contexts.
 * This removes all messages you've added to context using "Add to Context".
 */

import { ContextMenuCommandBuilder, ApplicationCommandType, MessageContextMenuCommandInteraction, Client, InteractionContextType } from "discord.js";
import { CommandOptions } from "../../types/commands";
import { clearUserContext } from "../../utils/ClearContext";

export const data = new ContextMenuCommandBuilder()
  .setName("AI -> Clear Context")
  .setType(ApplicationCommandType.Message)
  .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel]);

export const options: CommandOptions = {
  deleted: false,
};

export async function run(interaction: MessageContextMenuCommandInteraction, client: Client) {
  // Use shared logic to clear context (ephemeral = true)
  await clearUserContext(interaction, true);
}
