import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import { AttachmentBuilder } from "discord.js";
import { DocumentationService } from "../../../services/DocumentationService";
import { returnMessage } from "../../../utils/TinyUtils";
import Database from "../../../utils/data/database";
import ModmailConfig from "../../../models/ModmailConfig";
import log from "../../../utils/log";

export const importDocsOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Import documentation from URL for AI system
 */
export default async function importDocs({
  interaction,
  client,
  handler,
}: LegacySlashCommandProps) {
  const scope = interaction.options.getString("scope", true);
  const url = interaction.options.getString("url", true);
  const categoryId = interaction.options.getString("category");

  // Validate scope and category requirements
  if (scope === "category" && !categoryId) {
    return returnMessage(
      interaction,
      client,
      "Missing Category",
      "Please specify a category ID when importing category documentation.",
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

  // Validate category exists if specified
  if (categoryId) {
    const categoryExists =
      config.defaultCategory?.id === categoryId ||
      config.categories?.some((cat: any) => cat.id === categoryId);

    if (!categoryExists) {
      return returnMessage(
        interaction,
        client,
        "Category Not Found",
        `Category with ID "${categoryId}" was not found.`,
        { error: true, ephemeral: true, firstMsg: true }
      );
    }
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const documentationService = new DocumentationService();
    const result = await documentationService.importFromUrl(
      interaction.guild!.id,
      url,
      scope as "global" | "category",
      categoryId || undefined
    );

    if (!result.success) {
      return interaction.editReply({
        embeds: [
          {
            color: 0xff0000,
            title: "❌ Import Failed",
            description: result.error || "Unknown error occurred",
          },
        ],
      });
    }

    const doc = result.documentation!;
    return interaction.editReply({
      embeds: [
        {
          color: 0x00ff00,
          title: "✅ Documentation Imported",
          description: `Successfully imported ${scope} documentation from URL.`,
          fields: [
            {
              name: "📊 Statistics",
              value: `**Characters:** ${doc.metadata?.characterCount || 0}\n**Words:** ${
                doc.metadata?.wordCount || 0
              }\n**Version:** ${doc.version}`,
              inline: true,
            },
            {
              name: "🔗 Source",
              value: `[Documentation URL](${url})`,
              inline: true,
            },
            ...(categoryId
              ? [
                  {
                    name: "📁 Category",
                    value: categoryId,
                    inline: true,
                  },
                ]
              : []),
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    log.error("Error importing documentation:", error);
    return interaction.editReply({
      embeds: [
        {
          color: 0xff0000,
          title: "❌ Import Error",
          description: "An error occurred while importing documentation. Please try again.",
        },
      ],
    });
  }
}
