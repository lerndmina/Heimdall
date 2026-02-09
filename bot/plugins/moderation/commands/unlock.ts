/**
 * /unlock <channel> — Unlock a previously locked channel, restoring permissions.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type TextChannel, type NewsChannel } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("unlock")
  .setDescription("Unlock a locked channel, restoring its previous permissions")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("The channel to unlock (defaults to current channel)")
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  );

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
  const guild = interaction.guild!;

  // Verify the channel is a text/announcement channel
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("You can only unlock text or announcement channels.")],
    });
    return;
  }

  const result = await mod.channelLockService.unlockChannel(channel, interaction.user.id);

  if (result.success) {
    const embed = mod.lib
      .createEmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("🔓 Channel Unlocked")
      .addFields(
        { name: "Channel", value: `${channel}`, inline: true },
      )
      .setDescription("Permissions have been restored to their pre-lock state.");

    await interaction.editReply({ embeds: [embed] });

    // Send a notification in the unlocked channel
    try {
      const notifyEmbed = mod.lib
        .createEmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("🔓 Channel Unlocked")
        .setDescription(`This channel has been unlocked by ${interaction.user}.`)
        .setTimestamp();
      await channel.send({ embeds: [notifyEmbed] });
    } catch {
      // Channel might not be sendable
    }

    // Log the action
    await mod.modActionService.sendModLog(
      guild,
      "mod_actions",
      mod.lib
        .createEmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("🔓 Channel Unlocked")
        .addFields(
          { name: "Channel", value: `${channel} (${channel.name})`, inline: true },
          { name: "Moderator", value: `${interaction.user}`, inline: true },
        )
        .setFooter({ text: `Channel ID: ${channel.id}` }),
    );
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Failed to unlock channel: ${result.error}`)],
    });
  }
}
