/**
 * /tag create — Create a new tag in this server
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TagsPluginAPI } from "../../index.js";

export async function handleCreate(context: CommandContext, pluginAPI: TagsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString("name", true);
  const content = interaction.options.getString("content", true);
  const guildId = interaction.guildId!;

  try {
    const tag = await pluginAPI.tagService.createTag(guildId, name, content, interaction.user.id);

    if (!tag) {
      await interaction.editReply(`❌ A tag named \`${name.toLowerCase()}\` already exists. Use \`/tag edit\` to modify it.`);
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Tag Created")
      .addFields({ name: "Name", value: `\`${tag.name}\``, inline: true }, { name: "Content", value: tag.content.substring(0, 1024), inline: false });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create tag";
    await interaction.editReply(`❌ ${message}`);
  }
}
