import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import ModmailConfig from "../../../models/ModmailConfig";
import { returnMessage } from "../../../utils/TinyUtils";
import Database from "../../../utils/data/database";
import BasicEmbed from "../../../utils/BasicEmbed";
import log from "../../../utils/log";

export const statusAIOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Helper function to determine effective learning status with hierarchy
 */
function getEffectiveLearningStatus(
  globalEnabled: boolean,
  categoryValue: boolean | undefined
): string {
  if (!globalEnabled) {
    return "❌ Disabled (global override)";
  }

  if (categoryValue === false) {
    return "❌ Disabled (category setting)";
  }

  if (categoryValue === true) {
    return "✅ Enabled (explicitly set)";
  }

  // categoryValue is undefined - inherits from global
  return "✅ Enabled (inherited from global)";
}

/**
 * View current AI configuration for modmail
 */
export default async function statusAI({ interaction, client, handler }: LegacySlashCommandProps) {
  const db = new Database();

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

  try {
    const embed = BasicEmbed(client, "🤖 AI Configuration Status");

    // Global config
    const globalAI = config.globalAIConfig || {};
    const globalLearningEnabled = (globalAI as any).allowLearningPrompts !== false;

    embed.addFields({
      name: "🌐 Global Configuration",
      value:
        `**Enabled:** ${(globalAI as any).enabled ? "✅ Yes" : "❌ No"}\n` +
        `**Fallback to Global:** ${
          (globalAI as any).fallbackToGlobal !== false ? "✅ Yes" : "❌ No"
        }\n` +
        `**Documentation URL:** ${(globalAI as any).documentationUrl ? "✅ Set" : "❌ Not set"}\n` +
        `**Prevent Modmail Creation:** ${
          (globalAI as any).preventModmailCreation ? "✅ Yes" : "❌ No"
        }\n` +
        `**Learning Prompts:** ${
          globalLearningEnabled
            ? "✅ Enabled (allows per-category control)"
            : "❌ Disabled (overrides all categories)"
        }\n` +
        `**Response Style:** ${(globalAI as any).responseStyle || "helpful"}\n` +
        `**Max Tokens:** ${(globalAI as any).maxTokens || 500}\n` +
        `**Custom Prompt:** ${(globalAI as any).systemPrompt ? "✅ Set" : "❌ Not set"}`,
      inline: false,
    });

    // Default category
    if (config.defaultCategory?.aiConfig) {
      const defaultAI = config.defaultCategory.aiConfig as any;
      const categoryLearningEnabled = defaultAI.allowLearningPrompts !== false;
      const effectiveLearningStatus = globalLearningEnabled && categoryLearningEnabled;

      embed.addFields({
        name: `📂 Default Category: ${config.defaultCategory.name}`,
        value:
          `**Enabled:** ${defaultAI.enabled ? "✅ Yes" : "❌ No"}\n` +
          `**Documentation URL:** ${defaultAI.documentationUrl ? "✅ Set" : "❌ Not set"}\n` +
          `**Use Global Docs:** ${
            defaultAI.useGlobalDocumentation !== false ? "✅ Yes" : "❌ No"
          }\n` +
          `**Prevent Modmail Creation:** ${
            defaultAI.preventModmailCreation ? "✅ Yes" : "❌ No"
          }\n` +
          `**Learning Prompts:** ${getEffectiveLearningStatus(
            globalLearningEnabled,
            defaultAI.allowLearningPrompts
          )}\n` +
          `**Response Style:** ${defaultAI.responseStyle || "helpful"}\n` +
          `**Max Tokens:** ${defaultAI.maxTokens || 500}\n` +
          `**Custom Prompt:** ${defaultAI.systemPrompt ? "✅ Set" : "❌ Not set"}`,
        inline: true,
      });
    } else if (config.defaultCategory) {
      embed.addFields({
        name: `📂 Default Category: ${config.defaultCategory.name}`,
        value:
          "**AI Status:** ❌ Not configured\n" +
          "Use `/modmail ai enable` to enable AI for this category.",
        inline: true,
      });
    }

    // Additional categories with AI enabled
    const categoriesWithAI = config.categories?.filter((cat: any) => cat.aiConfig?.enabled) || [];
    const categoriesWithoutAI =
      config.categories?.filter((cat: any) => !cat.aiConfig?.enabled) || [];

    if (categoriesWithAI.length > 0) {
      for (const category of categoriesWithAI.slice(0, 3)) {
        // Show max 3 to avoid embed limits
        const ai = category.aiConfig as any;
        embed.addFields({
          name: `📁 ${category.name}`,
          value:
            `**Enabled:** ✅ Yes\n` +
            `**Documentation URL:** ${ai?.documentationUrl ? "✅ Set" : "❌ Not set"}\n` +
            `**Use Global Docs:** ${ai?.useGlobalDocumentation !== false ? "✅ Yes" : "❌ No"}\n` +
            `**Prevent Modmail Creation:** ${ai?.preventModmailCreation ? "✅ Yes" : "❌ No"}\n` +
            `**Learning Prompts:** ${getEffectiveLearningStatus(
              globalLearningEnabled,
              ai?.allowLearningPrompts
            )}\n` +
            `**Response Style:** ${ai?.responseStyle || "helpful"}\n` +
            `**Max Tokens:** ${ai?.maxTokens || 500}\n` +
            `**Custom Prompt:** ${ai?.systemPrompt ? "✅ Set" : "❌ Not set"}`,
          inline: true,
        });
      }

      if (categoriesWithAI.length > 3) {
        embed.addFields({
          name: "📋 Additional Categories with AI",
          value: `${categoriesWithAI.length - 3} more categories have AI enabled.`,
          inline: false,
        });
      }
    }

    // Categories without AI
    if (categoriesWithoutAI.length > 0) {
      const categoryNames = categoriesWithoutAI
        .slice(0, 5)
        .map((cat) => cat.name)
        .join(", ");
      const remainingCount = Math.max(0, categoriesWithoutAI.length - 5);

      embed.addFields({
        name: "📁 Categories without AI",
        value: categoryNames + (remainingCount > 0 ? ` and ${remainingCount} more` : ""),
        inline: false,
      });
    }

    // Summary and next steps
    const totalCategories = (config.categories?.length || 0) + (config.defaultCategory ? 1 : 0);
    const enabledCategories =
      categoriesWithAI.length + (config.defaultCategory?.aiConfig?.enabled ? 1 : 0);
    const globalEnabled = (globalAI as any).enabled;

    let statusText = `**Summary:** ${enabledCategories}/${totalCategories} categories have AI enabled`;
    if (globalEnabled) {
      statusText += " (plus global AI is enabled)";
    }

    embed.addFields({
      name: "📊 Quick Summary",
      value:
        statusText +
        "\n\n" +
        "**Next Steps:**\n" +
        "• Use `/modmail ai enable` to enable AI\n" +
        "• Use `/modmail ai configure` to customize settings and add documentation URLs\n" +
        "• Use `/modmail ai toggle-learning` to control learning prompts\n" +
        "• Use `/modmail ai disable` to disable AI\n" +
        "\n**Learning Prompts Hierarchy:**\n" +
        "• If global learning is disabled, no categories will show learning prompts\n" +
        "• If global learning is enabled, categories inherit this unless explicitly disabled\n" +
        "\n**Documentation URLs:** Provide links to Pastebin raw, GitHub raw, or Gist raw text files for AI context.",
      inline: false,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    log.error("Error getting AI status:", error);
    return returnMessage(
      interaction,
      client,
      "Error",
      "An error occurred while retrieving AI status. Please try again.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }
}
