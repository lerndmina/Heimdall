import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import ModmailConfig from "../../../models/ModmailConfig";
import { returnMessage } from "../../../utils/TinyUtils";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";

export const disableAIOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Disable AI responses for modmail - either globally or for specific categories
 */
export default async function disableAI({ interaction, client, handler }: LegacySlashCommandProps) {
  const db = new Database();
  const scope = interaction.options.getString("scope", true);
  const categoryId = interaction.options.getString("category");

  // Get current modmail config
  const config = await db.findOne(ModmailConfig, { guildId: interaction.guild!.id }, true);
  if (!config) {
    return returnMessage(
      interaction,
      client,
      "Not Configured",
      "Modmail is not configured for this server. Please set it up first with `/modmail setup`.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }

  if (scope === "category" && !categoryId) {
    return returnMessage(
      interaction,
      client,
      "Missing Category",
      "Please specify a category ID when using category scope.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }

  try {
    if (scope === "global") {
      // Disable global AI
      await db.findOneAndUpdate(
        ModmailConfig,
        { guildId: interaction.guild!.id },
        { $set: { "globalAIConfig.enabled": false } }
      );

      return returnMessage(
        interaction,
        client,
        "AI Disabled Globally",
        "AI responses have been disabled globally. Category-specific AI settings will still work if enabled.",
        { error: false, ephemeral: true, firstMsg: true }
      );
    } else {
      // Disable for specific category
      const category = findCategory(config, categoryId!);
      if (!category) {
        return returnMessage(
          interaction,
          client,
          "Category Not Found",
          `Category with ID "${categoryId}" was not found.`,
          { error: true, ephemeral: true, firstMsg: true }
        );
      }

      // Check if it's default category or additional category
      const isDefaultCategory = config.defaultCategory?.id === categoryId;

      if (isDefaultCategory) {
        await db.findOneAndUpdate(
          ModmailConfig,
          { guildId: interaction.guild!.id },
          { $set: { "defaultCategory.aiConfig.enabled": false } }
        );
      } else {
        // For array updates, use direct Mongoose query
        await ModmailConfig.findOneAndUpdate(
          { guildId: interaction.guild!.id, "categories.id": categoryId },
          { $set: { "categories.$.aiConfig.enabled": false } }
        );
      }

      return returnMessage(
        interaction,
        client,
        "AI Disabled",
        `AI responses have been disabled for category "${category.name}".`,
        { error: false, ephemeral: true, firstMsg: true }
      );
    }
  } catch (error) {
    log.error("Error disabling AI:", error);
    return returnMessage(
      interaction,
      client,
      "Error",
      "An error occurred while disabling AI responses. Please try again.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }
}

function findCategory(config: any, categoryId: string) {
  if (config.defaultCategory?.id === categoryId) {
    return config.defaultCategory;
  }
  return config.categories?.find((cat: any) => cat.id === categoryId);
}
