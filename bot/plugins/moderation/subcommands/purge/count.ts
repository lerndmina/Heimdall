/**
 * /purge count <amount> [filters] — Delete a specific number of messages.
 */

import type { GuildTextBasedChannel, Message } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../../index.js";
import { byUser, byBots, byContent, byHasAttachments, byAttachmentType, byHasEmbeds, byGifsAndTenor, byLinks } from "../../utils/purge-filters.js";

export async function handleCount(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");
  if (!mod) {
    await interaction.reply({ content: "Moderation plugin not loaded.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const amount = interaction.options.getInteger("amount", true);
  const channel = interaction.channel as GuildTextBasedChannel;

  const filters = buildFilters(interaction);

  const result = await mod.modActionService.purge(channel, {
    limit: amount,
    filters,
  });

  if (result.error) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Purge failed: ${result.error}`)],
    });
    return;
  }

  const embed = mod.lib
    .createEmbedBuilder()
    .setColor(0x22c55e)
    .setTitle("🗑️ Purge Complete")
    .addFields({ name: "Deleted", value: String(result.deleted), inline: true }, { name: "Skipped (too old)", value: String(result.skipped), inline: true });

  await interaction.editReply({ embeds: [embed] });
}

/** Build filter predicate array from command options */
function buildFilters(interaction: any): Array<(message: Message) => boolean> {
  const filters: Array<(message: Message) => boolean> = [];

  const userId = interaction.options.getUser("user")?.id;
  if (userId) filters.push(byUser(userId));

  const botsOnly = interaction.options.getBoolean("bots_only");
  if (botsOnly) filters.push(byBots());

  const contains = interaction.options.getString("contains");
  if (contains) filters.push(byContent(contains));

  const hasAttachments = interaction.options.getBoolean("has_attachments");
  if (hasAttachments) filters.push(byHasAttachments());

  const attachmentType = interaction.options.getString("attachment_type");
  if (attachmentType) filters.push(byAttachmentType(attachmentType));

  const hasEmbeds = interaction.options.getBoolean("has_embeds");
  if (hasEmbeds) filters.push(byHasEmbeds());

  const gifsOnly = interaction.options.getBoolean("gifs_only");
  if (gifsOnly) filters.push(byGifsAndTenor());

  const hasLinks = interaction.options.getBoolean("has_links");
  if (hasLinks) filters.push(byLinks());

  return filters;
}
