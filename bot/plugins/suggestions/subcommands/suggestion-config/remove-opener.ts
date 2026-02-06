/**
 * /suggestion-config remove-opener — Remove a suggestion opener message
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import SuggestionOpener from "../../models/SuggestionOpener.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:remove-opener");

export async function handleRemoveOpener(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = interaction.options.getChannel("channel", true);

    const opener = await SuggestionOpener.findOne({
      guildId: interaction.guildId!,
      channelId: channel.id,
    });

    if (!opener) {
      await interaction.editReply(`❌ No suggestion opener found in <#${channel.id}>.`);
      return;
    }

    // Try to delete the message
    try {
      const targetChannel = await interaction.guild?.channels.fetch(channel.id);
      if (targetChannel?.isTextBased()) {
        const message = await targetChannel.messages.fetch(opener.messageId);
        await message.delete();
      }
    } catch {
      log.warn("Could not delete opener message (may already be deleted)");
    }

    // Remove from database
    await SuggestionOpener.deleteOne({ _id: opener._id });

    await interaction.editReply(`✅ Suggestion opener removed from <#${channel.id}>.`);
    log.info(`Removed suggestion opener from channel ${channel.id} in guild ${interaction.guildId}`);
  } catch (error) {
    log.error("Error removing suggestion opener:", error);
    await interaction.editReply("❌ An error occurred while removing the opener. Please try again later.");
  }
}
