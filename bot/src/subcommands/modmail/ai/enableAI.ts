import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import ModmailConfig from "../../../models/ModmailConfig";
import { returnMessage } from "../../../utils/TinyUtils";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";

export const enableAIOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Enable AI responses for modmail - either globally or for specific categories
 */
export default async function enableAI({ interaction, client, handler }: LegacySlashCommandProps) {
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
      // Enable global AI - only set fields that don't exist, preserve existing ones
      const updateFields: any = {
        "globalAIConfig.enabled": true,
      };

      // Only set defaults for fields that don't already exist
      if (config.globalAIConfig?.fallbackToGlobal === undefined) {
        updateFields["globalAIConfig.fallbackToGlobal"] = true;
      }
      if (config.globalAIConfig?.preventModmailCreation === undefined) {
        updateFields["globalAIConfig.preventModmailCreation"] = false;
      }
      if (config.globalAIConfig?.includeFormData === undefined) {
        updateFields["globalAIConfig.includeFormData"] = true;
      }
      if (!config.globalAIConfig?.responseStyle) {
        updateFields["globalAIConfig.responseStyle"] = "helpful";
      }
      if (!config.globalAIConfig?.maxTokens) {
        updateFields["globalAIConfig.maxTokens"] = 500;
      }

      await db.findOneAndUpdate(
        ModmailConfig,
        { guildId: interaction.guild!.id },
        { $set: updateFields }
      );

      return returnMessage(
        interaction,
        client,
        "AI Enabled Globally",
        "AI responses have been enabled globally for all modmail categories. Use `/modmail ai configure` to customize settings.",
        { error: false, ephemeral: true, firstMsg: true }
      );
    } else {
      // Enable for specific category
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
          {
            $set: {
              "defaultCategory.aiConfig.enabled": true,
              "defaultCategory.aiConfig.preventModmailCreation": false,
              "defaultCategory.aiConfig.includeFormData": true,
              "defaultCategory.aiConfig.responseStyle": "helpful",
              "defaultCategory.aiConfig.maxTokens": 500,
            },
          }
        );
      } else {
        // For array updates, use direct Mongoose query
        await ModmailConfig.findOneAndUpdate(
          { guildId: interaction.guild!.id, "categories.id": categoryId },
          {
            $set: {
              "categories.$.aiConfig.enabled": true,
              "categories.$.aiConfig.preventModmailCreation": false,
              "categories.$.aiConfig.includeFormData": true,
              "categories.$.aiConfig.responseStyle": "helpful",
              "categories.$.aiConfig.maxTokens": 500,
            },
          }
        );
      }

      return returnMessage(
        interaction,
        client,
        "AI Enabled",
        `AI responses have been enabled for category "${category.name}". Use \`/modmail ai configure\` to customize settings.`,
        { error: false, ephemeral: true, firstMsg: true }
      );
    }
  } catch (error) {
    log.error("Error enabling AI:", error);
    return returnMessage(
      interaction,
      client,
      "Error",
      "An error occurred while enabling AI responses. Please try again.",
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
