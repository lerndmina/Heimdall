/**
 * /ticket-admin opener create - Create a new ticket opener
 */

import { nanoid } from "nanoid";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import TicketOpener from "../../models/TicketOpener.js";
import { OpenerUIType } from "../../types/index.js";

export async function handleOpenerCreate(context: CommandContext): Promise<void> {
  const { interaction } = context;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const name = interaction.options.getString("name", true);
    const uiType = interaction.options.getString("ui_type", true) as "buttons" | "dropdown";
    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description", true);

    const openerId = nanoid(12);
    const opener = new TicketOpener({
      id: openerId,
      guildId: interaction.guild.id,
      name,
      uiType: uiType === "buttons" ? OpenerUIType.BUTTONS : OpenerUIType.DROPDOWN,
      embedTitle: title,
      embedDescription: description,
      categoryIds: [],
      createdBy: interaction.user.id,
    });

    await opener.save();

    await interaction.editReply({
      content: `✅ Created opener: **${name}**\nID: \`${openerId}\`\n\nUse \`/ticket-admin opener edit\` to add categories, then \`/ticket-admin opener post\` to deploy.`,
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to create opener." });
  }
}
