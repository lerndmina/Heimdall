/**
 * /tag list — List all tags in this server
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TagsPluginAPI } from "../../index.js";

export async function handleList(context: CommandContext, pluginAPI: TagsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const { tags, total } = await pluginAPI.tagService.listTags(guildId, { sort: "uses", limit: 25 });

  if (tags.length === 0) {
    await interaction.editReply("📭 No tags found in this server. Use `/tag create` to make one!");
    return;
  }

  const fields = tags.map((tag) => ({
    name: tag.name,
    value: `${tag.content.substring(0, 100)}${tag.content.length > 100 ? "…" : ""}\n*${tag.uses} uses*`,
    inline: true,
  }));

  const embed = pluginAPI.lib.createEmbedBuilder().setTitle(`📋 Tags — ${interaction.guild!.name}`).setDescription(`Showing ${tags.length} of ${total} tags (sorted by usage)`).addFields(fields);

  if (total > 25) {
    embed.setFooter({ text: `${total - 25} more tags not shown` });
  }

  await interaction.editReply({ embeds: [embed] });
}
