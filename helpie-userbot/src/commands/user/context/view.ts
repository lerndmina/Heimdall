/**
 * Context View Command
 * Views details and preview of a specific context
 * Owner-only command
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { ContextService } from "../../../services/ContextService";
import { redisClient } from "../../../index";
import fetchEnvs from "../../../utils/FetchEnvs";
import log from "../../../utils/log";
import HelpieReplies from "../../../utils/HelpieReplies";

const env = fetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("view")
  .setDescription("View details and preview of a specific context")
  .addStringOption((option) =>
    option.setName("scope").setDescription("Context scope").setRequired(true).addChoices({ name: "Global", value: "global" }, { name: "Guild", value: "guild" }, { name: "User", value: "user" })
  )
  .addUserOption((option) => option.setName("target-user").setDescription("Target user (required for user scope)").setRequired(false))
  .addStringOption((option) => option.setName("target-guild").setDescription("Target guild ID (optional for guild scope, defaults to current)").setRequired(false));

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Owner-only validation
  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return HelpieReplies.warning(interaction, "This command is only available to bot owners.");
  }

  await HelpieReplies.deferSearching(interaction, true);

  try {
    const scope = interaction.options.getString("scope", true) as "global" | "guild" | "user";
    const targetUser = interaction.options.getUser("target-user");
    const targetGuild = interaction.options.getString("target-guild");

    // Validate scope-specific requirements
    if (scope === "user" && !targetUser) {
      return interaction.editReply({
        content: "❌ User scope requires a target user. Please specify `target-user`.",
      });
    }

    if (scope === "guild" && !targetGuild && !interaction.guildId) {
      return interaction.editReply({
        content: "❌ Guild scope requires a target guild ID or must be run in a guild.",
      });
    }

    // Get context
    const targetId = scope === "user" ? targetUser!.id : scope === "guild" ? targetGuild || interaction.guildId : undefined;

    const context = await ContextService.getContext(scope, targetId || undefined);

    if (!context) {
      return interaction.editReply({
        content: "❌ No context found for this scope.",
      });
    }

    // Get cache status and content
    const cached = await ContextService.getCacheStatus(scope, targetId || undefined);
    let preview = "Content not yet cached. Will be fetched on first use.";

    if (cached && redisClient.isReady) {
      const cacheKey = ContextService.buildCacheKey(scope, targetId || undefined);
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        const data = JSON.parse(cachedData);
        const content: string = data.content;
        preview = content.length > 1000 ? content.substring(0, 1000) + "\n\n... (truncated)" : content;
      }
    }

    // Build response
    let scopeDisplay = "Global";
    if (scope === "guild") {
      const guildId = targetGuild || interaction.guildId;
      const guild = client.guilds.cache.get(guildId!);
      scopeDisplay = `Guild (${guild?.name || guildId})`;
    } else if (scope === "user") {
      scopeDisplay = `User (${targetUser!.tag})`;
    }

    const size = context.characterCount ? `${context.characterCount} chars (${(context.characterCount / 1024).toFixed(1)}KB)` : "Unknown";
    const words = context.wordCount ? `${context.wordCount} words` : "Unknown";

    let response = `📄 **Context Details**

**Scope:** ${scopeDisplay}
${context.name ? `**Name:** ${context.name}\n` : ""}**URL:** ${context.githubUrl}
**Size:** ${size}
**Words:** ${words}
**Cached:** ${cached ? "✅ Yes" : "❌ No"}
**Usage Count:** ${context.usageCount || 0}
${context.lastUsed ? `**Last Used:** <t:${Math.floor(context.lastUsed.getTime() / 1000)}:R>\n` : ""}**Uploaded By:** <@${context.uploadedBy}>
**Uploaded At:** <t:${Math.floor(context.uploadedAt.getTime() / 1000)}:F>

**Preview:**
\`\`\`
${preview}
\`\`\``;

    // Split if too long
    if (response.length > 2000) {
      const parts: string[] = [];
      const header = response.substring(0, response.indexOf("**Preview:**"));
      parts.push(header);

      const previewStart = response.indexOf("```") + 3;
      const previewEnd = response.lastIndexOf("```");
      const fullPreview = response.substring(previewStart, previewEnd);

      const chunks = fullPreview.match(/[\s\S]{1,1800}/g) || [];
      chunks.forEach((chunk, i) => {
        parts.push(`**Preview (part ${i + 1}/${chunks.length}):**\n\`\`\`\n${chunk}\n\`\`\``);
      });

      await interaction.editReply({ content: parts[0] });
      for (let i = 1; i < parts.length; i++) {
        await interaction.followUp({ content: parts[i], ephemeral: true });
      }
    } else {
      await interaction.editReply({ content: response });
    }
  } catch (error) {
    log.error("Error viewing context:", error);
    await interaction.editReply({
      content: "❌ An error occurred while viewing the context. Please try again later.",
    });
  }
}
