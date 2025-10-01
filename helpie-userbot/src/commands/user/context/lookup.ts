/**
 * Context Lookup Command
 * Shows what contexts apply to a user/guild combination
 * Owner-only command
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { ContextService } from "../../../services/ContextService";
import fetchEnvs from "../../../utils/FetchEnvs";
import log from "../../../utils/log";
import HelpieReplies from "../../../utils/HelpieReplies";

const env = fetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("lookup")
  .setDescription("See what contexts apply to a user/guild combination")
  .addUserOption((option) => option.setName("target-user").setDescription("Target user (defaults to yourself)").setRequired(false))
  .addStringOption((option) => option.setName("target-guild").setDescription("Target guild ID (defaults to current guild)").setRequired(false));

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
    const targetUser = interaction.options.getUser("target-user") || interaction.user;
    const targetGuild = interaction.options.getString("target-guild") || interaction.guildId;

    // Get all applicable contexts
    const activeContexts: Array<{ scope: string; name: string; size: number; priority: number }> = [];

    // Check global context
    const globalContext = await ContextService.getContext("global");
    if (globalContext) {
      activeContexts.push({
        scope: "Global",
        name: globalContext.name || "Unnamed",
        size: globalContext.characterCount || 0,
        priority: 1,
      });
    }

    // Check guild context (if applicable)
    if (targetGuild) {
      const guildContext = await ContextService.getContext("guild", targetGuild);
      if (guildContext) {
        const guild = client.guilds.cache.get(targetGuild);
        activeContexts.push({
          scope: `Guild (${guild?.name || targetGuild})`,
          name: guildContext.name || "Unnamed",
          size: guildContext.characterCount || 0,
          priority: 2,
        });
      }
    }

    // Check user context
    const userContext = await ContextService.getContext("user", targetUser.id);
    if (userContext) {
      activeContexts.push({
        scope: `User (${targetUser.tag})`,
        name: userContext.name || "Unnamed",
        size: userContext.characterCount || 0,
        priority: 3,
      });
    }

    // Build response
    if (activeContexts.length === 0) {
      const noContextMessage = `🔍 **Context Lookup Results**

**User:** ${targetUser.tag}
${targetGuild ? `**Guild:** ${client.guilds.cache.get(targetGuild)?.name || targetGuild}\n` : ""}
**Active Contexts:** None

No contexts apply to this user/guild combination.`;

      return HelpieReplies.editInfo(interaction, noContextMessage);
    }

    const totalSize = activeContexts.reduce((sum, ctx) => sum + ctx.size, 0);
    const sizeDisplay = totalSize > 0 ? `${(totalSize / 1024).toFixed(1)}KB` : "Unknown";

    let response = `🔍 **Context Lookup Results**

**User:** ${targetUser.tag}
${targetGuild ? `**Guild:** ${client.guilds.cache.get(targetGuild)?.name || targetGuild}\n` : ""}
**Active Contexts (${activeContexts.length}):**

`;

    activeContexts.forEach((ctx, index) => {
      const emoji = ctx.priority === 1 ? "🌍" : ctx.priority === 2 ? "🏠" : "👤";
      const highlight = ctx.priority === 3 ? " ⭐ **Highest Priority**" : "";
      const size = ctx.size > 0 ? `(${(ctx.size / 1024).toFixed(1)}KB)` : "";
      response += `${index + 1}. ${emoji} ${ctx.scope}: ${ctx.name} ${size}${highlight}\n`;
    });

    response += `\n**Combined Size:** ${sizeDisplay}
**Priority Order:** Global → Guild → User

These contexts will be injected into \`/helpie ask\` responses.
User context has the highest priority and will be given more weight by the AI.`;

    await HelpieReplies.editInfo(interaction, response);
  } catch (error) {
    log.error("Error looking up contexts:", error);
    await HelpieReplies.editError(interaction, "An error occurred while looking up contexts. Please try again later.");
  }
}
