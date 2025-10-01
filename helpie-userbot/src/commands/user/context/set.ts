/**
 * Context Set Command
 * Sets or updates a context for global, guild, or user scope
 * Owner-only command
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { ContextService } from "../../../services/ContextService";
import fetchEnvs from "../../../utils/FetchEnvs";
import log from "../../../utils/log";

const env = fetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("set")
  .setDescription("Set or update a context from a GitHub URL")
  .addStringOption((option) =>
    option
      .setName("scope")
      .setDescription("Context scope")
      .setRequired(true)
      .addChoices({ name: "Global (all users everywhere)", value: "global" }, { name: "Guild (all users in a server)", value: "guild" }, { name: "User (specific user everywhere)", value: "user" })
  )
  .addStringOption((option) => option.setName("url").setDescription("GitHub raw URL or Gist URL (raw.githubusercontent.com or gist.githubusercontent.com)").setRequired(true))
  .addUserOption((option) => option.setName("target-user").setDescription("Target user (required for user scope)").setRequired(false))
  .addStringOption((option) => option.setName("target-guild").setDescription("Target guild ID (optional for guild scope, defaults to current)").setRequired(false))
  .addStringOption((option) => option.setName("name").setDescription("Friendly name for the context").setRequired(false).setMaxLength(100));

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Owner-only validation
  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: "❌ This command is only available to bot owners.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const scope = interaction.options.getString("scope", true) as "global" | "guild" | "user";
    const url = interaction.options.getString("url", true);
    const targetUser = interaction.options.getUser("target-user");
    const targetGuild = interaction.options.getString("target-guild");
    const name = interaction.options.getString("name");

    // Validate GitHub URL
    if (!ContextService.isValidGitHubRawUrl(url)) {
      return interaction.editReply({
        content: "❌ Invalid URL. Must be a GitHub raw URL or Gist URL starting with:\n- `https://raw.githubusercontent.com/`\n- `https://gist.githubusercontent.com/`",
      });
    }

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

    // Prepare options
    const contextOptions: any = { name };
    if (scope === "user") contextOptions.targetUserId = targetUser!.id;
    if (scope === "guild") contextOptions.targetGuildId = targetGuild || interaction.guildId;

    // Set context
    log.debug("Setting context", { scope, url, options: contextOptions });
    const context = await ContextService.setContext(scope, url, interaction.user.id, contextOptions);

    // Build response
    let scopeDisplay = "Global";
    if (scope === "guild") {
      const guildId = targetGuild || interaction.guildId;
      const guild = client.guilds.cache.get(guildId!);
      scopeDisplay = `Guild (${guild?.name || guildId})`;
    } else if (scope === "user") {
      scopeDisplay = `User (${targetUser!.tag})`;
    }

    const shortUrl = url.length > 60 ? url.substring(0, 57) + "..." : url;

    await interaction.editReply({
      content: `✅ **Context Set Successfully**

**Scope:** ${scopeDisplay}
${name ? `**Name:** ${name}\n` : ""}**URL:** ${shortUrl}
**Status:** Will be fetched on first use

${
  scope === "global"
    ? "This context will apply to all users everywhere."
    : scope === "guild"
    ? "This context will apply to all users in this guild."
    : "This context will apply to this specific user everywhere."
}

Run \`/helpie ask\` to test it!`,
    });

    log.info("Context set successfully", {
      scope,
      targetId: contextOptions.targetUserId || contextOptions.targetGuildId,
      uploadedBy: interaction.user.id,
    });
  } catch (error: any) {
    log.error("Error setting context:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return interaction.editReply({
        content: "✅ Context updated! (Existing context for this scope was replaced)",
      });
    }

    await interaction.editReply({
      content: "❌ An error occurred while setting the context. Please try again later.",
    });
  }
}
