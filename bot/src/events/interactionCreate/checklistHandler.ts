import { ButtonInteraction, ModalSubmitInteraction, Client, InteractionType } from "discord.js";
import { ChecklistService } from "../../services/ChecklistService";
import log from "../../utils/log";

export default async (
  interaction: ButtonInteraction | ModalSubmitInteraction,
  client: Client<true>
) => {
  try {
    // Handle button interactions for checklist building
    if (interaction.isButton()) {
      if (
        interaction.customId.includes("_") &&
        (interaction.customId.startsWith("set-") ||
          interaction.customId.startsWith("add-") ||
          interaction.customId.startsWith("save-") ||
          interaction.customId.startsWith("cancel-") ||
          interaction.customId.startsWith("edit-"))
      ) {
        await ChecklistService.handleBuilderInteraction(interaction);
        return true;
      } // Handle checklist instance buttons
      if (interaction.customId.startsWith("manage-checklist_")) {
        await ChecklistService.handleStaffManagement(interaction);
        return true;
      }

      if (interaction.customId.startsWith("verify-item")) {
        await ChecklistService.handleItemVerification(interaction);
        return true;
      }
    } // Handle modal submissions for checklist building
    if (interaction.isModalSubmit()) {
      if (
        interaction.customId.includes("_") &&
        (interaction.customId.startsWith("title-modal") ||
          interaction.customId.startsWith("description-modal") ||
          interaction.customId.startsWith("forum-modal") ||
          interaction.customId.startsWith("footer-modal") ||
          interaction.customId.startsWith("item-modal") ||
          interaction.customId.startsWith("verification-modal") ||
          interaction.customId.startsWith("step-verification-modal"))
      ) {
        await ChecklistService.handleModalSubmit(interaction);
        return true;
      }
    }

    return false; // Not handled by this handler
  } catch (error) {
    log(`Error in checklist interaction handler: ${error}`, "ERROR");

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "An error occurred while processing the checklist interaction.",
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content: "An error occurred while processing the checklist interaction.",
        });
      }
    } catch (replyError) {
      log(`Failed to reply to interaction after error: ${replyError}`, "ERROR");
    }

    return true; // Mark as handled even with error to prevent other handlers
  }
};
