import {
  ButtonInteraction,
  Client,
  EmbedBuilder,
  InteractionType,
  MessageComponentInteraction,
} from "discord.js";
import FetchEnvs, { DEFAULT_OPTIONAL_STRING, envExists } from "../../utils/FetchEnvs";
import { FivemReportMessageActions } from "../../types/FivemTypes";
import log from "../../utils/log";
import { fetchReportById } from "../../services/FivemReportService";
import { createGitHubIssue } from "../../services/GithubConnection";

const env = FetchEnvs();

if (env.ENABLE_FIVEM_SYSTEMS && env.FIVEM_MYSQL_URI !== DEFAULT_OPTIONAL_STRING) {
  module.exports = {
    default: async (interaction: ButtonInteraction, client: Client) => {
      if (!interaction.guild) return;
      if (interaction.user.bot) return;
      if (interaction.type !== InteractionType.MessageComponent) return;
      if (!interaction.customId || !interaction.customId.startsWith("fivem-report-")) return;

      // Parse the customId to get actionType and ticketId
      const parts = interaction.customId.split(":");
      if (parts.length !== 2) {
        log.error(`[FivemButtonListener]`, {
          error: "Invalid customId format",
          customId: interaction.customId,
        });
        return interaction.reply({
          content: "Invalid button format. Please contact an administrator.",
          ephemeral: true,
        });
      }

      // Extract action type from the first part
      const actionParts = parts[0].split("-");
      const actionType = actionParts.length >= 3 ? actionParts[2] : null;

      // Get the ticket ID from the second part
      const ticketId = parts[1];

      log.debug(`[FivemButtonListener]`, {
        info: "Button interaction detected",
        interactionUser: interaction.user.username,
        ticketId: ticketId,
        action: actionType,
        customId: interaction.customId,
      });

      // Validate action type
      if (!actionType || (actionType !== "can_reproduce" && actionType !== "cannot_reproduce")) {
        return interaction.reply({
          content: `Unknown action: ${actionType || "undefined"}`,
          ephemeral: true,
        });
      }

      // Start processing - defer the reply to give us time to fetch the report
      await interaction.deferReply({ ephemeral: true });

      // Fetch the report using the service
      const report = await fetchReportById(ticketId);

      if (!report) {
        return interaction.editReply({
          content:
            "Could not find the report. It may have been deleted or there was an error fetching it.",
        });
      }

      // Process the button action
      switch (actionType) {
        case "can_reproduce":
          // Get the original embed to update it
          const message = interaction.message;
          const originalEmbed = message.embeds[0];

          if (!originalEmbed) {
            return interaction.editReply({
              content: "Error: Couldn't find the original embed to update.",
            });
          }

          // Create updated embed (keep core data but update status)
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setTitle(`✅ Bug Confirmed: ${report.title}`)
            .setColor(0x3ba55d) // Discord success green
            .setFooter({
              text: `Bug confirmed by ${interaction.user.username}`,
            });

          // Update the message
          await interaction.message.edit({
            embeds: [updatedEmbed],
            components: [], // Remove buttons after action
          });

          let reproduceMessage = `You've confirmed that you can reproduce this bug: "${report.title}"`;

          const reportDetails = `\n**Bug ID**: ${report.ticketID}\n**Severity**: ${
            report.priority.text
          }\n**Media**: ${
            report.messages[0].media
              ? report.messages[0].media
                  .map((media, index) =>
                    media.fileURL ? `[Media ${index + 1}](${media.fileURL})` : null
                  )
                  .filter(Boolean)
                  .join(", ")
              : "No media provided"
          }\n**Description**: ${report.description}
              `;

          const issue = await createGitHubIssue(report.title, reportDetails, "Bugs");
          if (issue) {
            reproduceMessage += `\n\nA GitHub issue has been created: [View Issue](${issue.issueUrl})`;
          }

          return interaction.editReply({
            content: reproduceMessage,
          });

        case "cannot_reproduce":
          // Similar handling for cannot reproduce
          const cannotReproduceMessage = interaction.message;
          const cannotReproduceEmbed = cannotReproduceMessage.embeds[0];

          if (!cannotReproduceEmbed) {
            return interaction.editReply({
              content: "Error: Couldn't find the original embed to update.",
            });
          }

          // Create updated embed
          const updatedCannotReproduceEmbed = EmbedBuilder.from(cannotReproduceEmbed)
            .setTitle(`❌ Bug Not Reproducible: ${report.title}`)
            .setColor(0xe74c3c) // Red
            .setFooter({
              text: `Bug could not be reproduced by ${interaction.user.username} • Player ID: ${report.ticketOwnerDetails.id}`,
            });

          // Update the message
          await interaction.message.edit({
            embeds: [updatedCannotReproduceEmbed],
            components: [], // Remove buttons after action
          });

          return interaction.editReply({
            content: `You've indicated that you could not reproduce bug: "${report.title}"`,
          });

        default:
          return interaction.editReply({
            content: `Unknown action: ${actionType}`,
          });
      }
    },
  };
}
