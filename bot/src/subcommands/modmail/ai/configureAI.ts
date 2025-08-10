import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import ModmailConfig from "../../../models/ModmailConfig";
import { returnMessage } from "../../../utils/TinyUtils";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";

export const configureAIOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Configure AI settings for modmail - either globally or for specific categories
 */
export default async function configureAI({
  interaction,
  client,
  handler,
}: LegacySlashCommandProps) {
  const db = new Database();
  const scope = interaction.options.getString("scope", true);
  const categoryId = interaction.options.getString("category");
  const prompt = interaction.options.getString("prompt");
  const documentationUrl = interaction.options.getString("documentation-url");
  const useGlobalDocs = interaction.options.getBoolean("use-global-docs");
  const preventModmail = interaction.options.getBoolean("prevent-modmail");
  const style = interaction.options.getString("style");
  const maxTokens = interaction.options.getInteger("max-tokens");

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

  // Validate documentation URL if provided
  if (documentationUrl) {
    try {
      const url = new URL(documentationUrl);
      const validHosts = [
        "pastebin.com",
        "raw.githubusercontent.com",
        "gist.githubusercontent.com",
      ];
      const isValidHost = validHosts.some((host) => url.hostname.includes(host));

      if (!isValidHost) {
        return returnMessage(
          interaction,
          client,
          "Invalid Documentation URL",
          "Documentation URL must be from a supported service (Pastebin raw, GitHub raw, or Gist raw).\n" +
            "Example: https://pastebin.com/raw/abc123",
          { error: true, ephemeral: true, firstMsg: true }
        );
      }
    } catch (error) {
      return returnMessage(
        interaction,
        client,
        "Invalid URL",
        "Please provide a valid documentation URL.",
        { error: true, ephemeral: true, firstMsg: true }
      );
    }
  }

  // Validate useGlobalDocs is only used with category scope
  if (useGlobalDocs !== null && scope === "global") {
    return returnMessage(
      interaction,
      client,
      "Invalid Option",
      "The 'use-global-docs' option can only be used with category scope.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }

  // Build update object based on provided options
  const updates: any = {};
  if (prompt !== null) {
    if (prompt.length > 2000) {
      return returnMessage(
        interaction,
        client,
        "Prompt Too Long",
        "System prompt must be 2000 characters or less.",
        { error: true, ephemeral: true, firstMsg: true }
      );
    }
    updates.systemPrompt = prompt;
  }
  if (documentationUrl !== null) updates.documentationUrl = documentationUrl;
  if (useGlobalDocs !== null) updates.useGlobalDocumentation = useGlobalDocs;
  if (preventModmail !== null) updates.preventModmailCreation = preventModmail;
  if (style !== null) updates.responseStyle = style;
  if (maxTokens !== null) updates.maxTokens = maxTokens;

  if (Object.keys(updates).length === 0) {
    return returnMessage(
      interaction,
      client,
      "No Changes",
      "Please specify at least one setting to configure.",
      { error: true, ephemeral: true, firstMsg: true }
    );
  }

  try {
    if (scope === "global") {
      // Configure global AI
      const updateQuery = {
        $set: Object.fromEntries(
          Object.entries(updates).map(([key, value]) => [`globalAIConfig.${key}`, value])
        ),
      };

      await db.findOneAndUpdate(ModmailConfig, { guildId: interaction.guild!.id }, updateQuery);

      const changesText = Object.entries(updates)
        .map(([key, value]) => `• **${formatSettingName(key)}**: ${formatSettingValue(key, value)}`)
        .join("\n");

      return returnMessage(
        interaction,
        client,
        "Global AI Configuration Updated",
        `The following global AI settings have been updated:\n\n${changesText}`,
        { error: false, ephemeral: true, firstMsg: true }
      );
    } else {
      // Configure specific category
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

      const isDefaultCategory = config.defaultCategory?.id === categoryId;

      if (isDefaultCategory) {
        const updateQuery = {
          $set: Object.fromEntries(
            Object.entries(updates).map(([key, value]) => [
              `defaultCategory.aiConfig.${key}`,
              value,
            ])
          ),
        };

        await db.findOneAndUpdate(ModmailConfig, { guildId: interaction.guild!.id }, updateQuery);
      } else {
        // For array updates, use direct Mongoose query
        const updateQuery = {
          $set: Object.fromEntries(
            Object.entries(updates).map(([key, value]) => [`categories.$.aiConfig.${key}`, value])
          ),
        };

        await ModmailConfig.findOneAndUpdate(
          { guildId: interaction.guild!.id, "categories.id": categoryId },
          updateQuery
        );
      }

      const changesText = Object.entries(updates)
        .map(([key, value]) => `• **${formatSettingName(key)}**: ${formatSettingValue(key, value)}`)
        .join("\n");

      return returnMessage(
        interaction,
        client,
        "AI Configuration Updated",
        `AI settings for category "${category.name}" have been updated:\n\n${changesText}`,
        { error: false, ephemeral: true, firstMsg: true }
      );
    }
  } catch (error) {
    log.error("Error configuring AI:", error);
    return returnMessage(
      interaction,
      client,
      "Error",
      "An error occurred while configuring AI settings. Please try again.",
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

function formatSettingName(key: string): string {
  switch (key) {
    case "systemPrompt":
      return "System Prompt";
    case "documentationUrl":
      return "Documentation URL";
    case "useGlobalDocumentation":
      return "Use Global Documentation";
    case "preventModmailCreation":
      return "Prevent Modmail Creation";
    case "responseStyle":
      return "Response Style";
    case "maxTokens":
      return "Max Tokens";
    default:
      return key;
  }
}

function formatSettingValue(key: string, value: any): string {
  switch (key) {
    case "systemPrompt":
      return value.length > 100 ? `${value.substring(0, 100)}...` : value;
    case "documentationUrl":
      return value || "Not set";
    case "useGlobalDocumentation":
      return value ? "Yes" : "No";
    case "preventModmailCreation":
      return value ? "Yes" : "No";
    case "responseStyle":
      return value.charAt(0).toUpperCase() + value.slice(1);
    case "maxTokens":
      return value.toString();
    default:
      return value.toString();
  }
}
