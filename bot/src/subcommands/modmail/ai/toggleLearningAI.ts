import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import ModmailConfig from "../../../models/ModmailConfig";
import { returnMessage } from "../../../utils/TinyUtils";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";

export const toggleLearningAIOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Toggle whether AI will ask to learn from closed tickets
 */
export default async function toggleLearningAI({
  interaction,
  client,
  handler,
}: LegacySlashCommandProps) {
  const db = new Database();
  const scope = interaction.options.getString("scope", true);
  const categoryId = interaction.options.getString("category");
  const enabled = interaction.options.getBoolean("enabled", true);

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
      // Update global AI config
      if (!config.globalAIConfig) {
        config.globalAIConfig = {
          enabled: false,
          fallbackToGlobal: true,
          preventModmailCreation: false,
          includeFormData: true,
          responseStyle: "helpful",
          maxTokens: 500,
          allowLearningPrompts: enabled,
        };
      } else {
        config.globalAIConfig.allowLearningPrompts = enabled;
      }

      await db.findOneAndUpdate(
        ModmailConfig,
        { guildId: interaction.guild!.id },
        {
          "globalAIConfig.allowLearningPrompts": enabled,
        }
      );

      const statusText = enabled ? "enabled" : "disabled";
      const additionalInfo = enabled
        ? "Learning prompts will be shown for all categories unless specifically disabled per category."
        : "Learning prompts are now disabled for ALL categories regardless of individual category settings.";

      return returnMessage(
        interaction,
        client,
        "Learning Prompts Updated",
        `AI learning prompts have been **${statusText}** globally for all categories.\n\n${additionalInfo}`,
        { ephemeral: true, firstMsg: true }
      );
    } else {
      // Category scope
      if (categoryId === "default") {
        // Update default category
        if (!config.defaultCategory) {
          return returnMessage(
            interaction,
            client,
            "Default Category Not Found",
            "Default category configuration not found.",
            { error: true, ephemeral: true, firstMsg: true }
          );
        }

        if (!config.defaultCategory.aiConfig) {
          config.defaultCategory.aiConfig = {
            enabled: false,
            preventModmailCreation: false,
            includeFormData: true,
            responseStyle: "helpful",
            maxTokens: 500,
            allowLearningPrompts: enabled,
          };
        } else {
          config.defaultCategory.aiConfig.allowLearningPrompts = enabled;
        }

        await db.findOneAndUpdate(
          ModmailConfig,
          { guildId: interaction.guild!.id },
          {
            "defaultCategory.aiConfig.allowLearningPrompts": enabled,
          }
        );

        const statusText = enabled ? "enabled" : "disabled";
        const globalEnabled = config.globalAIConfig?.allowLearningPrompts !== false;
        let additionalInfo = "";

        if (enabled && !globalEnabled) {
          additionalInfo =
            "\n\n⚠️ **Note:** Learning prompts are disabled globally, so this category setting will have no effect until global learning is enabled.";
        } else if (!enabled && globalEnabled) {
          additionalInfo =
            "\n\n✅ This category will not show learning prompts, but other categories will still inherit the global setting.";
        }

        return returnMessage(
          interaction,
          client,
          "Learning Prompts Updated",
          `AI learning prompts have been **${statusText}** for the default category.${additionalInfo}`,
          { ephemeral: true, firstMsg: true }
        );
      } else {
        // Find and update specific category
        const categoryIndex = config.categories.findIndex((cat) => cat.id === categoryId);
        if (categoryIndex === -1) {
          return returnMessage(
            interaction,
            client,
            "Category Not Found",
            `Category with ID "${categoryId}" was not found.`,
            { error: true, ephemeral: true, firstMsg: true }
          );
        }

        const category = config.categories[categoryIndex];
        if (!category.aiConfig) {
          category.aiConfig = {
            enabled: false,
            preventModmailCreation: false,
            includeFormData: true,
            responseStyle: "helpful",
            maxTokens: 500,
            allowLearningPrompts: enabled,
          };
        } else {
          category.aiConfig.allowLearningPrompts = enabled;
        }

        await db.findOneAndUpdate(
          ModmailConfig,
          { guildId: interaction.guild!.id },
          {
            [`categories.${categoryIndex}.aiConfig.allowLearningPrompts`]: enabled,
          }
        );

        const categoryName = category.name;
        const statusText = enabled ? "enabled" : "disabled";
        const globalEnabled = config.globalAIConfig?.allowLearningPrompts !== false;
        let additionalInfo = "";

        if (enabled && !globalEnabled) {
          additionalInfo =
            "\n\n⚠️ **Note:** Learning prompts are disabled globally, so this category setting will have no effect until global learning is enabled.";
        } else if (!enabled && globalEnabled) {
          additionalInfo =
            "\n\n✅ This category will not show learning prompts, but other categories will still inherit the global setting.";
        }

        return returnMessage(
          interaction,
          client,
          "Learning Prompts Updated",
          `AI learning prompts have been **${statusText}** for the "${categoryName}" category.${additionalInfo}`,
          { ephemeral: true, firstMsg: true }
        );
      }
    }
  } catch (error) {
    log.error("Error toggling AI learning prompts:", error);
    return returnMessage(
      interaction,
      client,
      "Configuration Error",
      "Failed to update AI learning prompt configuration. Please try again.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }
}
