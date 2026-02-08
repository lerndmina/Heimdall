/**
 * /purge time <duration> [filters] — Delete messages within a time range.
 */

import { SnowflakeUtil, type GuildTextBasedChannel, type Message } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../../index.js";
import {
  byUser,
  byBots,
  byContent,
  byHasAttachments,
  byAttachmentType,
  byHasEmbeds,
  byGifsAndTenor,
  byLinks,
} from "../../utils/purge-filters.js";
import { PURGE_MAX_MESSAGES, BULK_DELETE_MAX_AGE_MS } from "../../utils/constants.js";

export async function handleTime(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");

  await interaction.deferReply({ ephemeral: true });

  const durationStr = interaction.options.getString("duration", true);
  const durationMs = mod.lib.parseDuration(durationStr);

  if (durationMs === null || durationMs <= 0) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("Invalid duration. Use formats like `30m`, `2h`, `1d`.")],
    });
    return;
  }

  // Clamp to 14 days (bulk delete limit)
  if (durationMs > BULK_DELETE_MAX_AGE_MS) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("Duration cannot exceed 14 days (Discord bulk-delete limit).")],
    });
    return;
  }

  const channel = interaction.channel as GuildTextBasedChannel;
  const filters = buildFilters(interaction);

  // Compute the "after" snowflake from the duration
  const afterTimestamp = Date.now() - durationMs;
  const afterSnowflake = SnowflakeUtil.generate({ timestamp: afterTimestamp }).toString();

  const result = await mod.modActionService.purge(channel, {
    limit: PURGE_MAX_MESSAGES,
    after: afterSnowflake,
    filters,
  });

  if (result.error) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Purge failed: ${result.error}`)],
    });
    return;
  }

  const embed = mod.lib.createEmbedBuilder()
    .setColor(0x22c55e)
    .setTitle("🗑️ Purge Complete")
    .addFields(
      { name: "Deleted", value: String(result.deleted), inline: true },
      { name: "Skipped (too old)", value: String(result.skipped), inline: true },
      { name: "Time Range", value: durationStr, inline: true },
    );

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
