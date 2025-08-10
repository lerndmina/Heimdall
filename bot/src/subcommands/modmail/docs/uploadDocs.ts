import {
  ChatInputCommandInteraction,
  Client,
  AttachmentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { DocumentationService } from "../../../services/DocumentationService";
import { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import { ModmailCache } from "../../../utils/ModmailCache";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";

export const uploadDocsOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageChannels"],
};

/**
 * Upload documentation from a text file
 */
export default async function uploadDocs({ interaction, client }: LegacySlashCommandProps) {
  if (!interaction.isChatInputCommand()) return;

  try {
    // Check permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Permission Denied",
            "You need the 'Manage Channels' permission to upload documentation."
          ),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const scope = interaction.options.getString("scope", true);
    const file = interaction.options.getAttachment("file", true);
    const categoryId = interaction.options.getString("category");

    // Validate inputs
    if (scope === "category" && !categoryId) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Missing Category",
            "Category ID is required when uploading to a specific category."
          ),
        ],
      });
    }

    // Validate file type
    if (!file.contentType?.includes("text") && !file.name?.endsWith(".txt")) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Invalid File Type",
            "Please upload a text file (.txt) containing the documentation."
          ),
        ],
      });
    }

    // Check file size (max 1MB)
    if (file.size > 1024 * 1024) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "File Too Large",
            "Documentation file must be smaller than 1MB."
          ),
        ],
      });
    }

    // Download and read the file content
    const { data: response, error: fetchError } = await tryCatch(fetch(file.url));
    if (fetchError || !response) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Download Failed",
            "Failed to download the uploaded file. Please try again."
          ),
        ],
      });
    }

    const { data: content, error: textError } = await tryCatch(response.text());
    if (textError || !content) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Read Failed",
            "Failed to read the file content. Please ensure it's a valid text file."
          ),
        ],
      });
    }

    // Validate content length
    if (content.length > 50000) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Content Too Large",
            "Documentation content is too large (max 50,000 characters)."
          ),
        ],
      });
    }

    if (content.length < 10) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Content Too Small",
            "Documentation content is too small (minimum 10 characters)."
          ),
        ],
      });
    }

    // Validate category if provided
    if (categoryId) {
      const { data: config } = await tryCatch(
        ModmailCache.getModmailConfig(
          interaction.guildId!,
          new (
            await import("../../../utils/data/database")
          ).default()
        )
      );

      if (!config) {
        return interaction.editReply({
          embeds: [
            ModmailEmbeds.error(
              client,
              "Configuration Error",
              "Modmail is not configured for this server."
            ),
          ],
        });
      }

      const validCategory = config.categories.find((cat: any) => cat.categoryId === categoryId);
      if (!validCategory) {
        return interaction.editReply({
          embeds: [
            ModmailEmbeds.error(
              client,
              "Invalid Category",
              "The specified category is not a valid modmail category."
            ),
          ],
        });
      }
    }

    // Store the documentation
    const documentationService = new DocumentationService();
    const result = await documentationService.storeDocumentation(
      interaction.guildId!,
      content,
      scope === "global" ? "global" : "category",
      categoryId || undefined
    );

    if (!result.success) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Storage Failed",
            result.error || "Failed to store documentation."
          ),
        ],
      });
    }

    // Success response
    const successEmbed = ModmailEmbeds.success(
      client,
      "Documentation Uploaded",
      `Successfully uploaded documentation from **${file.name}**!\n\n` +
        `**Scope:** ${
          scope === "global" ? "Global (all categories)" : `Category: <#${categoryId}>`
        }\n` +
        `**Characters:** ${content.length.toLocaleString()}\n` +
        `**Words:** ${content
          .split(/\\s+/)
          .filter((w) => w.length > 0)
          .length.toLocaleString()}\n\n` +
        `This documentation will now be used to help the AI provide better responses.`
    );

    await interaction.editReply({
      embeds: [successEmbed],
    });

    log.info(`Documentation uploaded by ${interaction.user.tag} in ${interaction.guild?.name}`, {
      scope,
      categoryId,
      contentLength: content.length,
      fileName: file.name,
    });
  } catch (error) {
    log.error("Error in upload docs subcommand:", error);

    const errorEmbed = ModmailEmbeds.error(
      client,
      "Upload Error",
      "An unexpected error occurred while uploading documentation."
    );

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
