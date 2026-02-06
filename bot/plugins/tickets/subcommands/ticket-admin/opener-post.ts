/**
 * /ticket-admin opener post - Post or update an opener message
 */

import { ChannelType, type TextChannel } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import type { LibAPI } from "../../../lib/index.js";
import TicketOpener from "../../models/TicketOpener.js";

export async function handleOpenerPost(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;
  const lib = getPluginAPI<LibAPI>("lib")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const openerId = interaction.options.getString("opener", true);
    const channel = interaction.options.getChannel("channel", true);

    if (channel.type !== ChannelType.GuildText) {
      await interaction.editReply({ content: "❌ Must be a text channel." });
      return;
    }

    const opener = await TicketOpener.findOne({ id: openerId, guildId: interaction.guild.id });
    if (!opener) {
      await interaction.editReply({ content: "❌ Opener not found." });
      return;
    }

    if (opener.categoryIds.length === 0) {
      await interaction.editReply({ content: "❌ Add at least one category before posting." });
      return;
    }

    // Build and send opener message
    const { embed, components } = await tickets.utils.buildOpenerMessage(lib, opener, interaction.guild.id, {
      info: (...args) => {},
      warn: (...args) => {},
      error: (...args) => {},
      debug: (...args) => {},
    });

    const textChannel = channel as TextChannel;
    const message = await textChannel.send({ embeds: [embed], components });

    // Update opener with channel/message reference
    opener.channelId = channel.id;
    opener.messageId = message.id;
    await opener.save();

    await interaction.editReply({
      content: `✅ Posted opener in <#${channel.id}>`,
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to post opener." });
  }
}
