/**
 * Context List Command
 * Lists all contexts or contexts of a specific scope
 * Owner-only command
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { ContextService } from "../../../services/ContextService";
import fetchEnvs from "../../../utils/FetchEnvs";
import log from "../../../utils/log";

const env = fetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("List all contexts")
  .addStringOption((option) =>
    option
      .setName("scope")
      .setDescription("Filter by scope (optional)")
      .setRequired(false)
      .addChoices({ name: "All", value: "all" }, { name: "Global", value: "global" }, { name: "Guild", value: "guild" }, { name: "User", value: "user" })
  );

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
    const scopeFilter = interaction.options.getString("scope");
    const scope = scopeFilter && scopeFilter !== "all" ? (scopeFilter as "global" | "guild" | "user") : undefined;

    const contexts = await ContextService.listContexts(scope);

    if (contexts.length === 0) {
      return interaction.editReply({
        content: scope ? `📋 No ${scope} contexts found.` : "📋 No contexts configured yet.\n\nUse `/helpie context set` to add one!",
      });
    }

    // Group by scope
    const globalContexts = contexts.filter((c) => c.scope === "global");
    const guildContexts = contexts.filter((c) => c.scope === "guild");
    const userContexts = contexts.filter((c) => c.scope === "user");

    let response = "📋 **Helpie Context Configuration**\n\n";

    // Global contexts
    if (globalContexts.length > 0) {
      response += "🌍 **Global Context**\n";
      for (const ctx of globalContexts) {
        const shortUrl = ctx.githubUrl.replace("https://raw.githubusercontent.com/", "github.com/.../");
        const cached = await ContextService.getCacheStatus("global");
        const size = ctx.characterCount ? `${(ctx.characterCount / 1024).toFixed(1)}KB` : "Unknown";
        response += `   ${ctx.name || "Unnamed"}\n`;
        response += `   URL: ${shortUrl}\n`;
        response += `   Size: ${size} | Cached: ${cached ? "✅" : "❌"}\n\n`;
      }
    }

    // Guild contexts
    if (guildContexts.length > 0) {
      response += `🏠 **Guild Contexts (${guildContexts.length})**\n`;
      for (const ctx of guildContexts) {
        const guild = client.guilds.cache.get(ctx.targetGuildId!);
        const guildName = guild?.name || ctx.targetGuildId;
        const cached = await ContextService.getCacheStatus("guild", ctx.targetGuildId);
        const size = ctx.characterCount ? `${(ctx.characterCount / 1024).toFixed(1)}KB` : "Unknown";
        response += `   • ${guildName}: ${ctx.name || "Unnamed"} (${size}) ${cached ? "✅" : "❌"}\n`;
      }
      response += "\n";
    }

    // User contexts
    if (userContexts.length > 0) {
      response += `👤 **User Contexts (${userContexts.length})**\n`;
      for (const ctx of userContexts) {
        try {
          const user = await client.users.fetch(ctx.targetUserId!);
          const cached = await ContextService.getCacheStatus("user", ctx.targetUserId);
          const size = ctx.characterCount ? `${(ctx.characterCount / 1024).toFixed(1)}KB` : "Unknown";
          response += `   • @${user.tag}: ${ctx.name || "Unnamed"} (${size}) ${cached ? "✅" : "❌"}\n`;
        } catch {
          const cachedFallback = await ContextService.getCacheStatus("user", ctx.targetUserId);
          response += `   • ${ctx.targetUserId}: ${ctx.name || "Unnamed"} ${cachedFallback ? "✅" : "❌"}\n`;
        }
      }
      response += "\n";
    }

    response += `\nUse \`/helpie context view\` to see details.`;

    // Split if too long
    if (response.length > 2000) {
      const parts = response.match(/[\s\S]{1,1900}/g) || [];
      await interaction.editReply({ content: parts[0] });
      for (let i = 1; i < parts.length; i++) {
        await interaction.followUp({ content: parts[i], ephemeral: true });
      }
    } else {
      await interaction.editReply({ content: response });
    }
  } catch (error) {
    log.error("Error listing contexts:", error);
    await interaction.editReply({
      content: "❌ An error occurred while listing contexts. Please try again later.",
    });
  }
}
