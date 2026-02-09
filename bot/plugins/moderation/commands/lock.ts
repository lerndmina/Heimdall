/**
 * /lock <channel> [reason] [duration] — Lock a channel, removing write permissions.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type TextChannel, type NewsChannel } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ModerationPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("lock")
  .setDescription("Lock a channel, preventing members from sending messages")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((opt) =>
    opt.setName("channel").setDescription("The channel to lock (defaults to current channel)").setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason for locking the channel").setRequired(false))
  .addStringOption((opt) => opt.setName("duration").setDescription("How long to lock the channel (e.g. 1h, 30m, 2d)").setRequired(false));

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");
  if (!mod) {
    await interaction.reply({ content: "Moderation plugin not loaded.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const channel = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel | NewsChannel;
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const durationStr = interaction.options.getString("duration");
  const guild = interaction.guild!;

  // Parse duration if provided
  let duration: number | null = null;
  if (durationStr) {
    const parsed = mod.lib.parseDuration(durationStr);
    if (!parsed || parsed <= 0) {
      await interaction.editReply({
        embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("Invalid duration format. Use formats like `30m`, `1h`, `2d`.")],
      });
      return;
    }
    duration = parsed;
  }

  // Verify the channel is a text/announcement channel
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("You can only lock text or announcement channels.")],
    });
    return;
  }

  const result = await mod.channelLockService.lockChannel(channel, interaction.user.id, reason, duration);

  if (result.success) {
    const embed = mod.lib
      .createEmbedBuilder()
      .setColor(0xef4444)
      .setTitle("🔒 Channel Locked")
      .addFields({ name: "Channel", value: `${channel}`, inline: true }, { name: "Reason", value: reason });

    if (duration) {
      const expiresAt = new Date(Date.now() + duration);
      embed.addFields({
        name: "Expires",
        value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
    broadcastDashboardChange(guild.id, "moderation", "channel_lock_updated", { requiredAction: "moderation.manage_config" });

    // Log the action
    await mod.modActionService.sendModLog(
      guild,
      "mod_actions",
      mod.lib
        .createEmbedBuilder()
        .setColor(0xef4444)
        .setTitle("🔒 Channel Locked")
        .addFields(
          { name: "Channel", value: `${channel} (${channel.name})`, inline: true },
          { name: "Moderator", value: `${interaction.user}`, inline: true },
          { name: "Reason", value: reason },
          ...(duration ? [{ name: "Duration", value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true }] : []),
        )
        .setFooter({ text: `Channel ID: ${channel.id}` }),
    );
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Failed to lock channel: ${result.error}`)],
    });
  }
}
