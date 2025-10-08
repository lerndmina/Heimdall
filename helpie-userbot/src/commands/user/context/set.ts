/**
 * Context Set Command
 * Sets or updates a context for global, guild, or user scope
 * Owner-only command
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { ContextService } from "../../../services/ContextService";
import fetchEnvs from "../../../utils/FetchEnvs";
import log from "../../../utils/log";
import HelpieReplies from "../../../utils/HelpieReplies";

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
    return HelpieReplies.warning(interaction, "This command is only available to bot owners.");
  }

  await HelpieReplies.deferThinking(interaction, true);

  try {
    const scope = interaction.options.getString("scope", true) as "global" | "guild" | "user";
    const url = interaction.options.getString("url", true);
    const targetUser = interaction.options.getUser("target-user");
    const targetGuild = interaction.options.getString("target-guild");
    const name = interaction.options.getString("name");

    // Validate GitHub URL
    if (!ContextService.isValidGitHubRawUrl(url)) {
      return HelpieReplies.editWarning(
        interaction,
        "Invalid URL. Must be a GitHub raw URL or Gist URL starting with:\n- `https://raw.githubusercontent.com/`\n- `https://gist.githubusercontent.com/`"
      );
    }

    // Validate scope-specific requirements
    if (scope === "user" && !targetUser) {
      return HelpieReplies.editWarning(interaction, "User scope requires a target user. Please specify `target-user`.");
    }

    if (scope === "guild" && !targetGuild && !interaction.guildId) {
      return HelpieReplies.editWarning(interaction, "Guild scope requires a target guild ID or must be run in a guild.");
    }

    // Prepare options
    const contextOptions: any = { name };
    if (scope === "user") contextOptions.targetUserId = targetUser!.id;
    if (scope === "guild") contextOptions.targetGuildId = targetGuild || interaction.guildId;

    // Set context
    log.debug("Setting context", { scope, url, options: contextOptions });
    const context = await ContextService.setContext(scope, url, interaction.user.id, contextOptions);

    // Trigger background processing for vector embeddings with progress updates
    const { ContextProcessingService } = await import("../../../services/ContextProcessingService");

    // Process context and send follow-ups
    ContextProcessingService.processContext(context._id.toString())
      .then(async (result) => {
        if (result.success) {
          log.info("Context processed successfully", {
            contextId: result.contextId,
            chunkCount: result.chunkCount,
            totalTokens: result.totalTokens,
          });

          // Send success follow-up
          await interaction
            .followUp({
              content: `✅ **Context Processing Complete**

📦 Generated ${result.chunkCount} chunk${result.chunkCount !== 1 ? "s" : ""} from your document
🎯 Total tokens: ${result.totalTokens?.toLocaleString() || "N/A"}
💾 Vector embeddings saved to database

Your context is now ready! Try \`/helpie ask\` to test it.`,
              ephemeral: true,
            })
            .catch((err) => log.error("Failed to send success follow-up:", err));
        } else {
          log.error("Context processing failed:", result.error);

          // Send error follow-up
          await interaction
            .followUp({
              content: `❌ **Context Processing Failed**

**Error:** ${result.error}

The context was saved but embeddings could not be generated. Please check the logs or try refreshing with \`/helpie context refresh\`.`,
              ephemeral: true,
            })
            .catch((err) => log.error("Failed to send error follow-up:", err));
        }
      })
      .catch(async (error) => {
        log.error("Context processing error:", error);

        // Send error follow-up
        await interaction
          .followUp({
            content: `❌ **Context Processing Error**

An unexpected error occurred during processing. Check logs for details.`,
            ephemeral: true,
          })
          .catch((err) => log.error("Failed to send error follow-up:", err));
      });

    // Build response (this edits the deferred message)
    let scopeDisplay = "Global";
    if (scope === "guild") {
      const guildId = targetGuild || interaction.guildId;
      const guild = client.guilds.cache.get(guildId!);
      scopeDisplay = `Guild (${guild?.name || guildId})`;
    } else if (scope === "user") {
      scopeDisplay = `User (${targetUser!.tag})`;
    }

    const shortUrl = url.length > 60 ? url.substring(0, 57) + "..." : url;

    const responseMessage = `**Context Set Successfully**

**Scope:** ${scopeDisplay}
${name ? `**Name:** ${name}\n` : ""}**URL:** ${shortUrl}
**Status:** Processing in background (chunking + embedding)

${
  scope === "global"
    ? "This context will apply to all users everywhere."
    : scope === "guild"
    ? "This context will apply to all users in this guild."
    : "This context will apply to this specific user everywhere."
}

⚙️ Processing will take a few moments. You'll receive an update when complete!`;

    await HelpieReplies.editSuccess(interaction, responseMessage);

    log.info("Context set successfully", {
      scope,
      targetId: contextOptions.targetUserId || contextOptions.targetGuildId,
      uploadedBy: interaction.user.id,
    });
  } catch (error: any) {
    log.error("Error setting context:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return HelpieReplies.editSuccess(interaction, "Context updated! (Existing context for this scope was replaced)");
    }

    await HelpieReplies.editError(interaction, "An error occurred while setting the context. Please try again later.");
  }
}
