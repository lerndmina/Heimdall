/**
 * Ask Context Menu Command - Right-click a message to ask Helpie about it
 *
 * This context menu command allows users to right-click any message and
 * ask Helpie AI a question about it. The message content is automatically
 * included in the prompt.
 */

import { ContextMenuCommandBuilder, ApplicationCommandType, MessageContextMenuCommandInteraction, Client } from "discord.js";
import { CommandOptions } from "../../types/commands";
import HelpieReplies from "../../utils/HelpieReplies";
import { processAskQuestion } from "../../utils/AskHelpie";

export const data = new ContextMenuCommandBuilder().setName("Ask Helpie About This").setType(ApplicationCommandType.Message);

export const options: CommandOptions = {
  deleted: false,
};

export async function run(interaction: MessageContextMenuCommandInteraction, client: Client) {
  // Interaction is already typed as MessageContextMenuCommandInteraction
  // No type guard needed - SimpleCommandHandler ensures correct type

  // Get the target message
  const targetMessage = interaction.targetMessage;

  // Extract message content (handle different message types)
  let messageContent = targetMessage.content;

  // If message has no text content, check for embeds or attachments
  if (!messageContent || messageContent.trim().length === 0) {
    if (targetMessage.embeds.length > 0) {
      const embed = targetMessage.embeds[0];
      messageContent = `[Embed: ${embed.title || "No title"}]\n${embed.description || "No description"}`;
    } else if (targetMessage.attachments.size > 0) {
      const attachmentNames = Array.from(targetMessage.attachments.values())
        .map((a) => a.name)
        .join(", ");
      messageContent = `[Message with attachments: ${attachmentNames}]`;
    } else {
      return HelpieReplies.warning(interaction, "This message has no content I can analyze.", true);
    }
  }

  // Truncate very long messages to stay within API limits
  const maxLength = 1500;
  if (messageContent.length > maxLength) {
    messageContent = messageContent.substring(0, maxLength) + "...";
  }

  // Show thinking emoji while processing
  await HelpieReplies.deferThinking(interaction);

  // Create the prompt that includes the message context
  const prompt = `Please analyze or explain this message:\n\n"${messageContent}"\n\nFrom: ${targetMessage.author.tag}`;

  // Process the question using shared logic
  await processAskQuestion({
    message: prompt,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    interaction,
  });
}
