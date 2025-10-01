/**
 * Context Refresh Command
 * Marks all cached contexts as stale (clears Redis cache)
 * Owner-only command
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { ContextService } from "../../../services/ContextService";
import fetchEnvs from "../../../utils/FetchEnvs";
import log from "../../../utils/log";
import HelpieReplies from "../../../utils/HelpieReplies";

const env = fetchEnvs();

export const data = new SlashCommandBuilder().setName("refresh").setDescription("Clear all context caches (contexts will be re-fetched on next use)");

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
    const count = await ContextService.clearAllCaches();

    await interaction.editReply({
      content: `✅ **Context Caches Cleared**

Cleared ${count} cached context${count !== 1 ? "s" : ""}.

Contexts will be re-fetched from GitHub on their next use.
This is useful after updating context files on GitHub.`,
    });

    log.info("Context caches cleared", { count, by: interaction.user.id });
  } catch (error) {
    log.error("Error refreshing contexts:", error);
    await interaction.editReply({
      content: "❌ An error occurred while refreshing contexts. Please try again later.",
    });
  }
}
