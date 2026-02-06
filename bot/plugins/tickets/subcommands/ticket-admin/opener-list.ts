/**
 * /ticket-admin opener list - List all ticket openers
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { LibAPI } from "../../../lib/index.js";
import TicketOpener from "../../models/TicketOpener.js";

export async function handleOpenerList(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const lib = getPluginAPI<LibAPI>("lib")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const openers = await TicketOpener.find({ guildId: interaction.guild.id });

    if (openers.length === 0) {
      await interaction.editReply({ content: "❌ No openers found." });
      return;
    }

    const embed = lib.createEmbedBuilder().setTitle("📋 Ticket Openers").setDescription(`Found **${openers.length}** opener(s)`).setColor("Blue");

    for (const opener of openers.slice(0, 10)) {
      const status = opener.channelId ? `📍 <#${opener.channelId}>` : "Not posted";
      embed.addFields({
        name: `${opener.name} (${opener.uiType})`,
        value: `ID: \`${opener.id}\`\nCategories: ${opener.categoryIds.length}\nStatus: ${status}`,
        inline: true,
      });
    }

    if (openers.length > 10) {
      embed.setFooter({ text: `Showing first 10 of ${openers.length} openers` });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to list openers." });
  }
}
