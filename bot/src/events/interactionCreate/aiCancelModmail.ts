import { ButtonInteraction, Client, EmbedBuilder } from "discord.js";
import { redisClient } from "../../Bot";
import log from "../../utils/log";

export default async (interaction: ButtonInteraction, client: Client<true>) => {
  if (!interaction.customId || !interaction.isButton()) return;
  if (!interaction.customId.startsWith("ai_cancel_modmail:")) return;

  // Update the existing message immediately to show the cancellation
  await interaction.update({
    content: null,
    components: [], // Remove all buttons
  });

  try {
    // Extract context key from custom ID
    const contextKey = interaction.customId.replace("ai_cancel_modmail:", "");

    // Clean up the stored context from Redis
    if (!redisClient) {
      log.warn("Redis client not available for AI cancel modmail cleanup");
      return;
    }

    // Check if context exists before deleting
    const contextData = await redisClient.get(contextKey);
    if (contextData) {
      await redisClient.del(contextKey);
      log.debug(`AI Cancel Modmail: Cleaned up context for user ${interaction.user.id}`);
    }

    log.info(`AI Cancel Modmail: User ${interaction.user.id} chose not to create a support ticket`);
  } catch (error) {
    log.error("Error in AI cancel modmail handler:", error);
    // Don't show error to user since the cancellation message was already sent
    // The cleanup failure is not critical for user experience
  }
};
