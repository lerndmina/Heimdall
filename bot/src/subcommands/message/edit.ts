import { SlashCommandProps } from "commandkit";
import { validateAndGetMessage } from "../../utils/MessageUtils";
import { MessageProcessor } from "../../services/MessageProcessor";
import CommandError from "../../utils/interactionErrors/CommandError";
import { MessageEditOptions } from "discord.js";
import { createViewMessageButton } from "./shared";
import log from "../../utils/log";

/**
 * Edit message subcommand
 * Allows editing existing bot messages using Discohook data
 */
export default async function ({ interaction, client }: SlashCommandProps) {
  try {
    await interaction.editReply("Finding message...");

    // Get and validate message
    const messageUrl = interaction.options.getString("url", true);
    const message = await validateAndGetMessage(client, messageUrl);

    // Get message data options
    const attachment = interaction.options.getAttachment("data");
    const shortLink = interaction.options.getString("short-link");
    const removeComponents = interaction.options.getBoolean("remove-components") ?? false;

    // Process message content
    await interaction.editReply("Processing message data...");
    const result = await MessageProcessor.processMessage(attachment, shortLink);

    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to process message data");
    }

    // Create message edit options
    const editData: MessageEditOptions = {
      content: result.data.content,
      embeds: result.data.embeds ?? [],
      components: removeComponents ? [] : message.components ?? [],
      allowedMentions: result.data.allowedMentions,
      files: result.data.files,
    };

    // Update message
    await interaction.editReply("Updating message...");
    await message.edit(editData);

    // Send success response
    await interaction.editReply({
      content: `Message edited successfully`,
      components: [createViewMessageButton(message.url).toJSON()],
    });
  } catch (error) {
    log.error(`Edit message error: ${error}`);
    return new CommandError(`Failed to edit message: ${error}`, interaction, client).send();
  }
}
