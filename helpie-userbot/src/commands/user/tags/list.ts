/**
 * Tags List Command
 * Lists all tags for the current user
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import TagModel from "../../../models/Tag";
import log from "../../../utils/log";
import HelpieReplies from "../../../utils/HelpieReplies";

export const data = new SlashCommandBuilder().setName("list").setDescription("List all your tags");

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  await HelpieReplies.deferSearching(interaction, true);

  try {
    // Get both global tags and user's personal tags
    const [globalTags, userTags] = await Promise.all([TagModel.find({ scope: "global" }).sort({ name: 1 }), TagModel.find({ userId: interaction.user.id, scope: "user" }).sort({ name: 1 })]);

    if (globalTags.length === 0 && userTags.length === 0) {
      return interaction.editReply({
        content: "🏷️ **No Tags Found**\n\nNo tags available yet.\n\nCreate one with `/helpie tags add <name> <content>`",
      });
    }

    // Build tag list with usage stats
    let response = "";

    // Global tags section
    if (globalTags.length > 0) {
      response += `🌍 **Global Tags (${globalTags.length})**\n\n`;
      for (const tag of globalTags) {
        const preview = tag.content.length > 50 ? tag.content.substring(0, 47) + "..." : tag.content;
        const usageInfo = tag.usageCount > 0 ? ` • ${tag.usageCount}x` : "";
        response += `**${tag.name}**${usageInfo}\n`;
        response += `└ _${preview}_\n\n`;
      }
    }

    // User tags section
    if (userTags.length > 0) {
      response += `👤 **Your Tags (${userTags.length})**\n\n`;
      for (const tag of userTags) {
        const preview = tag.content.length > 50 ? tag.content.substring(0, 47) + "..." : tag.content;
        const usageInfo = tag.usageCount > 0 ? ` • ${tag.usageCount}x` : "";
        response += `**${tag.name}**${usageInfo}\n`;
        response += `└ _${preview}_\n\n`;
      }
    }

    response += `\nUse a tag: \`/helpie tag <name>\``;

    await interaction.editReply({
      content: response,
    });
  } catch (error: any) {
    log.error("Failed to list tags:", error);

    return HelpieReplies.editError(interaction, {
      title: "Failed to List Tags",
      message: `Failed to retrieve tags: ${error.message || "Unknown error"}`,
    });
  }
}
