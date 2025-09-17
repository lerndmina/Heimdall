import { SlashCommandBuilder } from "discord.js";
import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import BasicEmbed from "../../utils/BasicEmbed";
import { THRESHOLD_CONFIG_INFO, AI_MODERATION_THRESHOLDS } from "../../utils/moderationThresholds";
import { ModerationCategory } from "../../models/ModeratedChannels";

export const data = new SlashCommandBuilder()
  .setName("moderation-thresholds")
  .setDescription("DEV ONLY: View current AI moderation thresholds and configuration")
  .addStringOption((option) =>
    option
      .setName("action")
      .setDescription("Action to perform")
      .setRequired(false)
      .addChoices(
        { name: "View All", value: "all" },
        { name: "View Changes Only", value: "changes" },
        { name: "View Config Info", value: "info" }
      )
  );

export const options: LegacyCommandOptions = {
  devOnly: true,
  deleted: false,
};

export async function run({ interaction, client }: LegacySlashCommandProps) {
  const action = interaction.options.getString("action") ?? "all";

  try {
    switch (action) {
      case "info": {
        const embed = BasicEmbed(
          client,
          "🔧 Threshold Configuration Info",
          `**Version:** ${THRESHOLD_CONFIG_INFO.version}\n` +
            `**Analysis Date:** ${THRESHOLD_CONFIG_INFO.analysisDate}\n` +
            `**Based on Reports:** ${THRESHOLD_CONFIG_INFO.basedOnReports}\n` +
            `**Expected FP Reduction:** ${THRESHOLD_CONFIG_INFO.expectedFalsePositiveReduction}\n` +
            `**Estimated Time Savings:** ${THRESHOLD_CONFIG_INFO.estimatedStaffTimeSaving}`
        );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case "changes": {
        const changedThresholds = THRESHOLD_CONFIG_INFO.categories
          .filter((cat) => cat.change !== "no change")
          .map((cat) => `**${cat.category}:** ${cat.threshold} (${cat.change})`)
          .join("\n");

        const embed = BasicEmbed(
          client,
          "📊 Modified Thresholds Only",
          changedThresholds || "No thresholds have been modified from default (0.5)"
        );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case "all":
      default: {
        const allThresholds = Object.entries(AI_MODERATION_THRESHOLDS)
          .map(([category, threshold]) => {
            const change = threshold === 0.5 ? "" : threshold > 0.5 ? " 📈" : " 📉";
            return `**${category}:** ${threshold}${change}`;
          })
          .join("\n");

        const embed = BasicEmbed(
          client,
          "🎯 Current AI Moderation Thresholds",
          `${allThresholds}\n\n` +
            `📈 = Increased from 0.5 (stricter)\n` +
            `📉 = Decreased from 0.5 (more sensitive)\n\n` +
            `*These thresholds were optimized based on analysis of ${THRESHOLD_CONFIG_INFO.basedOnReports} reports*`
        );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  } catch (error) {
    console.error("Error in moderation-thresholds command:", error);
    return interaction.reply({
      embeds: [BasicEmbed(client, "❌ Error", "Failed to retrieve threshold information.")],
      ephemeral: true,
    });
  }
}
