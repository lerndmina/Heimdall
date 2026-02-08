/**
 * /tag use — Send a tag's content, optionally mentioning a user.
 * When used inside a modmail forum thread, attaches a "Forward to User" button.
 */

import { userMention, ActionRowBuilder, ButtonStyle } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TagsPluginAPI } from "../../index.js";
import { TAG_FORWARD_HANDLER_ID } from "../../index.js";
import Modmail, { ModmailStatus } from "../../../modmail/models/Modmail.js";

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

  // Check if we're inside a modmail forum thread
  let forwardRow: ActionRowBuilder<any> | null = null;

  if (interaction.channel?.isThread()) {
    try {
      const modmail = await Modmail.findOne({
        forumThreadId: interaction.channelId,
        status: { $ne: ModmailStatus.CLOSED },
      });

      if (modmail) {
        // Create "Forward to User" persistent button with tag content in metadata
        const btn = pluginAPI.lib.createButtonBuilderPersistent(TAG_FORWARD_HANDLER_ID, {
          tagContent: tag.content,
          tagName: tag.name,
        });
        btn.setLabel("Forward to User").setStyle(ButtonStyle.Primary).setEmoji("📨");
        await btn.ready();

        forwardRow = new ActionRowBuilder<any>().addComponents(btn);
      }
    } catch {
      // If modmail model isn't available (plugin not loaded), just skip silently
    }
  }

  await interaction.reply({
    content,
    ...(forwardRow ? { components: [forwardRow] } : {}),
  });
}
