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
    // Clear Redis cache
    const cacheCount = await ContextService.clearAllCaches();

    // Trigger re-processing of all contexts
    const { ContextProcessingService } = await import("../../../services/ContextProcessingService");
    const contexts = await ContextService.listContexts();

    // Start processing all contexts in background
    let processedCount = 0;
    const processPromises = contexts.map(async (context) => {
      try {
        const result = await ContextProcessingService.refreshContext(context._id.toString());
        if (result.success) {
          processedCount++;
        }
        return result;
      } catch (error) {
        log.error(`Failed to refresh context ${context._id}:`, error);
        return { success: false, contextId: context._id.toString(), error: String(error) };
      }
    });

    await HelpieReplies.editSuccess(
      interaction,
      `**Context Refresh Started**

Cleared ${cacheCount} cached context${cacheCount !== 1 ? "s" : ""}.
Processing ${contexts.length} context${contexts.length !== 1 ? "s" : ""} in background...

⚙️ This will re-fetch content from GitHub and regenerate vector embeddings.
You'll receive updates when complete.`
    );

    // Wait for all processing to complete (in background)
    Promise.all(processPromises)
      .then(async (results) => {
        const successful = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        log.info("Context refresh completed", {
          total: contexts.length,
          successful,
          failed,
          by: interaction.user.id,
        });

        // Send completion follow-up
        if (successful > 0 && failed === 0) {
          await interaction
            .followUp({
              content: `✅ **All Contexts Refreshed Successfully**

📦 Processed ${successful} context${successful !== 1 ? "s" : ""}
💾 Vector embeddings regenerated

All contexts are now up to date!`,
              ephemeral: true,
            })
            .catch((err) => log.error("Failed to send refresh completion follow-up:", err));
        } else if (successful > 0 && failed > 0) {
          await interaction
            .followUp({
              content: `⚠️ **Context Refresh Partially Complete**

✅ Successful: ${successful}
❌ Failed: ${failed}

Check logs for error details on failed contexts.`,
              ephemeral: true,
            })
            .catch((err) => log.error("Failed to send refresh completion follow-up:", err));
        } else {
          await interaction
            .followUp({
              content: `❌ **Context Refresh Failed**

All ${failed} context${failed !== 1 ? "s" : ""} failed to process.
Check logs for error details.`,
              ephemeral: true,
            })
            .catch((err) => log.error("Failed to send refresh completion follow-up:", err));
        }
      })
      .catch(async (error) => {
        log.error("Context refresh error:", error);
        await interaction
          .followUp({
            content: `❌ **Context Refresh Error**

An unexpected error occurred. Check logs for details.`,
            ephemeral: true,
          })
          .catch((err) => log.error("Failed to send error follow-up:", err));
      });
  } catch (error) {
    log.error("Error refreshing contexts:", error);
    await HelpieReplies.editError(interaction, "An error occurred while refreshing contexts. Please try again later.");
  }
}
