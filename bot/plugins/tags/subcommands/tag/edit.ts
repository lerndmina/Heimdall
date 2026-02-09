/**
 * /tag edit — Edit an existing tag's content
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { TagsPluginAPI } from "../../index.js";

export async function handleEdit(context: CommandContext, pluginAPI: TagsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString("name", true);
  const content = interaction.options.getString("content", true);
  const guildId = interaction.guildId!;

  // Check ownership: only creator or members with ManageMessages can edit
  const existingTag = await pluginAPI.tagService.getTag(guildId, name);
  if (!existingTag) {
    await interaction.editReply(`❌ Tag \`${name}\` not found.`);
    return;
  }

  if (existingTag.createdBy !== interaction.user.id && !interaction.memberPermissions?.has("ManageGuild")) {
    await interaction.editReply("❌ You can only edit tags you created, or you need Manage Server permission.");
    return;
  }

  try {
    const tag = await pluginAPI.tagService.updateTag(guildId, name, content);
    if (!tag) {
      await interaction.editReply(`❌ Tag \`${name}\` not found.`);
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Tag Updated")
      .addFields({ name: "Name", value: `\`${tag.name}\``, inline: true }, { name: "New Content", value: tag.content.substring(0, 1024), inline: false });

    await interaction.editReply({ embeds: [embed] });
    broadcastDashboardChange(guildId, "tags", "tag_updated", { requiredAction: "tags.manage_tags" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update tag";
    await interaction.editReply(`❌ ${message}`);
  }
}
