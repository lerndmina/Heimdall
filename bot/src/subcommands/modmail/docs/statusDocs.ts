import { ChatInputCommandInteraction, Client, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { DocumentationService } from "../../../services/DocumentationService";
import { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import { ModmailCache } from "../../../utils/ModmailCache";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";

export const statusDocsOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageChannels"],
};

/**
 * View documentation status
 */
export default async function statusDocs({ interaction, client }: LegacySlashCommandProps) {
  if (!interaction.isChatInputCommand()) return;

  try {
    // Check permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Permission Denied",
            "You need the 'Manage Channels' permission to view documentation status."
          ),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const documentationService = new DocumentationService();

    // Get all documentation
    const allDocs = await documentationService.getAllDocumentation(interaction.guildId!);

    // Get modmail config to show category names
    const { data: config } = await tryCatch(
      ModmailCache.getModmailConfig(
        interaction.guildId!,
        new (
          await import("../../../utils/data/database")
        ).default()
      )
    );

    // Organize documentation by type
    const globalDocs = allDocs.filter((doc) => doc.type === "global" && !doc.categoryId);
    const categoryDocs = allDocs.filter((doc) => doc.type === "category" && doc.categoryId);

    // Create status embed
    const embed = new EmbedBuilder()
      .setTitle("📚 Documentation Status")
      .setColor(0x5865f2)
      .setTimestamp();

    // Global documentation section
    let description = "## 🌍 Global Documentation\n";

    if (globalDocs.length > 0) {
      const doc = globalDocs[0];
      description += `✅ **Configured** (${
        doc.metadata?.characterCount?.toLocaleString() || 0
      } chars, ${doc.metadata?.wordCount?.toLocaleString() || 0} words)\n`;
      description += `📅 Last Updated: <t:${Math.floor(doc.lastUpdated.getTime() / 1000)}:R>\n`;
      if (doc.sourceUrl) {
        description += `🔗 Source: ${doc.sourceUrl}\n`;
      }
    } else {
      description += `❌ **Not configured**\n`;
    }

    // Category documentation section
    description += "\n## 📋 Category Documentation\n";

    if (config && config.categories && config.categories.length > 0) {
      for (const category of config.categories) {
        const categoryDoc = categoryDocs.find((doc) => doc.categoryId === category.id);

        description += `\n**<#${category.forumChannelId}>** (${category.id})\n`;

        if (categoryDoc) {
          description += `✅ Documentation: ${
            categoryDoc.metadata?.characterCount?.toLocaleString() || 0
          } chars\n`;
          description += `📅 Last Updated: <t:${Math.floor(
            categoryDoc.lastUpdated.getTime() / 1000
          )}:R>\n`;
          if (categoryDoc.sourceUrl) {
            description += `🔗 Source: ${categoryDoc.sourceUrl}\n`;
          }
        } else {
          description += `❌ No documentation configured\n`;
        }
      }
    } else {
      description += "❌ No modmail categories configured\n";
    }

    embed.setDescription(description);

    // Add summary statistics
    const totalDocs = allDocs.length;
    const totalChars = allDocs.reduce((sum, doc) => sum + (doc.metadata?.characterCount || 0), 0);
    const totalWords = allDocs.reduce((sum, doc) => sum + (doc.metadata?.wordCount || 0), 0);

    embed.addFields({
      name: "📈 Summary",
      value:
        `**Total Documents**: ${totalDocs}\n` +
        `**Total Content**: ${totalChars.toLocaleString()} characters, ${totalWords.toLocaleString()} words\n` +
        `**Status**: ${totalDocs > 0 ? "AI Enhanced ✨" : "Basic AI Only"}`,
      inline: false,
    });

    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    log.error("Error in status docs subcommand:", error);

    const errorEmbed = ModmailEmbeds.error(
      client,
      "Status Error",
      "An unexpected error occurred while retrieving documentation status."
    );

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
