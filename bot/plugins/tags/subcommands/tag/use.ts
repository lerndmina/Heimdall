/**
 * /tag use — Send a tag's content, optionally mentioning a user
 */

import { userMention } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TagsPluginAPI } from "../../index.js";

export async function handleUse(context: CommandContext, pluginAPI: TagsPluginAPI): Promise<void> {
  const { interaction } = context;
  const name = interaction.options.getString("name", true);
  const user = interaction.options.getUser("user");
  const guildId = interaction.guildId!;

  const tag = await pluginAPI.tagService.getTag(guildId, name);
  if (!tag) {
    await interaction.reply({ content: `❌ Tag \`${name}\` not found.`, ephemeral: true });
    return;
  }

  // Increment usage counter (fire-and-forget)
  pluginAPI.tagService.incrementUses(guildId, name);

  const content = user ? `${userMention(user.id)}\n${tag.content}` : tag.content;

  await interaction.reply({ content });
}
