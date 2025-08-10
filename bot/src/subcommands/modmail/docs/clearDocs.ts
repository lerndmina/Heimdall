import { ChatInputCommandInteraction, Client, PermissionFlagsBits } from "discord.js";
import { DocumentationService } from "../../../services/DocumentationService";
import { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import { ModmailCache } from "../../../utils/ModmailCache";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";

export const clearDocsOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageChannels"],
};

/**
 * Clear documentation
 */
export default async function clearDocs({ interaction, client }: LegacySlashCommandProps) {
  if (!interaction.isChatInputCommand()) return;

  try {
    // Check permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Permission Denied",
            "You need the 'Manage Channels' permission to clear documentation."
          ),
        ],
        ephemeral: true,
      });
    }

    const scope = interaction.options.getString("scope", true);
    const categoryId = interaction.options.getString("category");
    const confirm = interaction.options.getBoolean("confirm", true);

    // Validate confirmation
    if (!confirm) {
      return interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Confirmation Required",
            "You must set the `confirm` option to `True` to delete documentation."
          ),
        ],
        ephemeral: true,
      });
    }

    // Validate category requirement for category scopes
    if (scope === "category" && !categoryId) {
      return interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Missing Category",
            "Category ID is required for category-specific operations."
          ),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

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

    const documentationService = new DocumentationService();
    let result: boolean = false;
    let scopeDescription = "";

    // Execute the clear operation based on scope
    switch (scope) {
      case "global":
        result = await documentationService.deleteDocumentation(interaction.guildId!, "global");
        scopeDescription = "Global documentation";
        break;

      case "category":
        result = await documentationService.deleteDocumentation(
          interaction.guildId!,
          "category",
          categoryId!
        );
        scopeDescription = `Category documentation for <#${categoryId}>`;
        break;

      default:
        return interaction.editReply({
          embeds: [
            ModmailEmbeds.error(
              client,
              "Invalid Scope",
              "Invalid scope provided for clear operation."
            ),
          ],
        });
    }

    if (!result) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Clear Failed",
            `Failed to clear ${scopeDescription}. It may not exist or there was a database error.`
          ),
        ],
      });
    }

    // Success response
    const successEmbed = ModmailEmbeds.success(
      client,
      "Documentation Cleared",
      `Successfully cleared **${scopeDescription}**.\n\n` +
        `⚠️ This action cannot be undone. The AI will no longer have access to this documentation.`
    );

    await interaction.editReply({
      embeds: [successEmbed],
    });

    log.info(`Documentation cleared by ${interaction.user.tag} in ${interaction.guild?.name}`, {
      scope,
      categoryId,
      scopeDescription,
    });
  } catch (error) {
    log.error("Error in clear docs subcommand:", error);

    const errorEmbed = ModmailEmbeds.error(
      client,
      "Clear Error",
      "An unexpected error occurred while clearing documentation."
    );

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
