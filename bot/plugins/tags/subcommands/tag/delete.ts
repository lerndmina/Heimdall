/**
 * /tag delete — Delete a tag from this server
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { TagsPluginAPI } from "../../index.js";

export async function handleDelete(context: CommandContext, pluginAPI: TagsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString("name", true);
  const guildId = interaction.guildId!;

  // Check ownership: only creator or members with ManageGuild can delete
  const existingTag = await pluginAPI.tagService.getTag(guildId, name);
  if (!existingTag) {
    await interaction.editReply(`❌ Tag \`${name}\` not found.`);
    return;
  }

  if (existingTag.createdBy !== interaction.user.id && !interaction.memberPermissions?.has("ManageGuild")) {
    await interaction.editReply("❌ You can only delete tags you created, or you need Manage Server permission.");
    return;
  }

  const deleted = await pluginAPI.tagService.deleteTag(guildId, name);
  if (!deleted) {
    await interaction.editReply(`❌ Tag \`${name}\` not found.`);
    return;
  }

  // If the tag was registered as a slash command, re-sync guild commands
  if (existingTag.registerAsSlashCommand) {
    try {
      await pluginAPI.tagSlashCommandService.toggleSlashCommand(guildId, name, false);
    } catch {
      // Tag is already deleted, just need to refresh commands
    }
  }

  await interaction.editReply(`✅ Tag \`${name}\` has been deleted.`);
  broadcastDashboardChange(guildId, "tags", "tag_deleted", { requiredAction: "tags.manage_tags" });
}
