import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import { AttachmentBuilder } from "discord.js";
import { DocumentationService } from "../../../services/DocumentationService";
import { returnMessage } from "../../../utils/TinyUtils";
import Database from "../../../utils/data/database";
import ModmailConfig from "../../../models/ModmailConfig";
import log from "../../../utils/log";

export const exportDocsOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Export documentation as downloadable text file
 */
export default async function exportDocs({
  interaction,
  client,
  handler,
}: LegacySlashCommandProps) {
  const scope = interaction.options.getString("scope", true);
  const categoryId = interaction.options.getString("category");

  // Validate scope and category requirements
  if (scope === "category" && !categoryId) {
    return returnMessage(
      interaction,
      client,
      "Missing Category",
      "Please specify a category ID when exporting category documentation.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }

  // Check if modmail is configured
  const db = new Database();
  const config = await db.findOne(ModmailConfig, { guildId: interaction.guild!.id });
  if (!config) {
    return returnMessage(
      interaction,
      client,
      "Not Configured",
      "Modmail is not configured for this server. Please set it up first with `/modmail setup`.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const documentationService = new DocumentationService();
    let docs;

    if (scope === "all") {
      // Export all documentation for the guild
      docs = await documentationService.getAllDocumentation(interaction.guild!.id);
    } else if (scope === "global") {
      // Export only global documentation
      const globalDoc = await documentationService.getDocumentation(
        interaction.guild!.id,
        "global"
      );
      docs = [globalDoc].filter((doc) => doc !== null);
    } else if (scope === "category" && categoryId) {
      // Export category-specific documentation
      const categoryDoc = await documentationService.getDocumentation(
        interaction.guild!.id,
        "category",
        categoryId
      );
      docs = [categoryDoc].filter((doc) => doc !== null);
    } else {
      return returnMessage(
        interaction,
        client,
        "Invalid Parameters",
        "Invalid scope or missing category ID.",
        { error: true, ephemeral: true, firstMsg: true }
      );
    }

    if (!docs || docs.length === 0) {
      return interaction.editReply({
        embeds: [
          {
            color: 0xffa500,
            title: "📝 No Documentation Found",
            description: `No documentation found for the specified scope: ${scope}${
              categoryId ? ` (category: ${categoryId})` : ""
            }.`,
          },
        ],
      });
    }

    // Generate export text
    const exportText = documentationService.exportDocumentationAsText(docs);
    const buffer = Buffer.from(exportText, "utf-8");

    // Create filename based on scope
    let filename = `${interaction.guild!.name.replace(/[^a-zA-Z0-9]/g, "_")}_docs`;
    if (scope === "category" && categoryId) {
      filename += `_${categoryId}`;
    } else if (scope === "global") {
      filename += "_global";
    } else {
      filename += "_all";
    }
    filename += `_${new Date().toISOString().split("T")[0]}.txt`;

    const attachment = new AttachmentBuilder(buffer, { name: filename });

    return interaction.editReply({
      embeds: [
        {
          color: 0x00ff00,
          title: "📤 Documentation Exported",
          description: `Successfully exported ${scope} documentation.`,
          fields: [
            {
              name: "📊 Export Summary",
              value: `**Documents:** ${docs.length}\n**Total Characters:** ${docs.reduce(
                (sum, doc) => sum + (doc.metadata?.characterCount || 0),
                0
              )}\n**Total Words:** ${docs.reduce(
                (sum, doc) => sum + (doc.metadata?.wordCount || 0),
                0
              )}`,
              inline: true,
            },
            {
              name: "📁 File",
              value: `\`${filename}\``,
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
      files: [attachment],
    });
  } catch (error) {
    log.error("Error exporting documentation:", error);
    return interaction.editReply({
      embeds: [
        {
          color: 0xff0000,
          title: "❌ Export Error",
          description: "An error occurred while exporting documentation. Please try again.",
        },
      ],
    });
  }
}
