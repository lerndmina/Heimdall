import { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import {
  ChatInputCommandInteraction,
  Client,
  AttachmentBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { contextService } from "../../../services/ContextService";
import BasicEmbed from "../../../utils/BasicEmbed";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";

export const contextOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Handle context management subcommands
 */
export default async function handleContext({ interaction, client }: LegacySlashCommandProps) {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "upload":
        return await uploadContext(interaction, client);
      case "status":
        return await showStatus(interaction, client);
      case "remove":
        return await removeContext(interaction, client);
      case "toggle-bot":
        return await toggleBotContext(interaction, client);
      case "toggle-custom":
        return await toggleCustomContext(interaction, client);
      case "set-priority":
        return await setPriority(interaction, client);
      case "export":
        return await exportContext(interaction, client);
      default:
        return interaction.reply({
          content: "Invalid subcommand.",
          ephemeral: true,
        });
    }
  } catch (error) {
    log.error("Error in context command:", error);
    return interaction.reply({
      embeds: [
        BasicEmbed(
          client,
          "Error",
          "An error occurred while processing your request.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
  }
}

/**
 * Upload context from file
 */
async function uploadContext(interaction: ChatInputCommandInteraction, client: Client) {
  const file = interaction.options.getAttachment("file", true);
  const useBotContext = interaction.options.getBoolean("use-bot-context") ?? true;
  const useCustomContext = interaction.options.getBoolean("use-custom-context") ?? true;
  const priority =
    (interaction.options.getString("priority") as "bot" | "custom" | "both") ?? "both";

  // Validate file
  if (!file.name.endsWith(".txt") && !file.name.endsWith(".md")) {
    return interaction.reply({
      embeds: [
        BasicEmbed(
          client,
          "Invalid File",
          "Only .txt and .md files are supported.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
  }

  if (file.size > 50000) {
    // 50KB limit
    return interaction.reply({
      embeds: [
        BasicEmbed(client, "File Too Large", "File must be smaller than 50KB.", undefined, "Red"),
      ],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Download file content
    const response = await fetch(file.url);
    if (!response.ok) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(client, "Download Failed", "Failed to download the file.", undefined, "Red"),
        ],
      });
    }

    const content = await response.text();

    // Store context
    const result = await contextService.storeGuildContext(
      interaction.guildId!,
      content,
      interaction.user.id,
      file.name,
      {
        useBotContext,
        useCustomContext,
        priority,
      }
    );

    if (!result.success) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "Upload Failed",
            result.error || "Failed to store context.",
            undefined,
            "Red"
          ),
        ],
      });
    }

    // Success response
    const embed = BasicEmbed(
      client,
      "Context Uploaded Successfully",
      `**File:** ${file.name}\n` +
        `**Size:** ${Math.round((content.length / 1024) * 100) / 100} KB\n` +
        `**Words:** ${result.context!.metadata.wordCount}\n\n` +
        `**Settings:**\n` +
        `• Bot Context: ${useBotContext ? "✅ Enabled" : "❌ Disabled"}\n` +
        `• Custom Context: ${useCustomContext ? "✅ Enabled" : "❌ Disabled"}\n` +
        `• Priority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}`,
      undefined,
      "Green"
    );

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    log.error("Error uploading context:", error);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Upload Error",
          "An error occurred while uploading the context.",
          undefined,
          "Red"
        ),
      ],
    });
  }
}

/**
 * Show context status
 */
async function showStatus(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });

  const { data: context, error } = await tryCatch(
    contextService.getGuildContext(interaction.guildId!)
  );

  if (error) {
    log.error("Error getting context status:", error);
    return interaction.editReply({
      embeds: [BasicEmbed(client, "Error", "Failed to retrieve context status.", undefined, "Red")],
    });
  }

  if (!context) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "No Context Configured",
          "This server doesn't have any custom AI context configured.\n\n" +
            "Use `/settings context upload` to add server-specific context for the AI assistant.",
          undefined,
          "Blue"
        ),
      ],
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("🤖 AI Context Configuration")
    .setColor(0x00ff00)
    .setDescription(
      `**Custom Context:** ${context.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
        `**Bot Knowledge:** ${context.settings.useBotContext ? "✅ Enabled" : "❌ Disabled"}\n` +
        `**Custom Context Usage:** ${
          context.settings.useCustomContext ? "✅ Enabled" : "❌ Disabled"
        }\n` +
        `**Priority:** ${
          context.settings.priority.charAt(0).toUpperCase() + context.settings.priority.slice(1)
        }\n\n` +
        `**Content Info:**\n` +
        `• Size: ${Math.round((context.metadata.characterCount / 1024) * 100) / 100} KB\n` +
        `• Words: ${context.metadata.wordCount}\n` +
        `• File: ${context.metadata.filename || "Unknown"}\n\n` +
        `**Last Updated:** <t:${Math.floor(context.lastUpdated.getTime() / 1000)}:R>\n` +
        `**Uploaded by:** <@${context.uploadedBy.userId}>`
    )
    .setFooter({ text: "Use /settings context to manage AI context" });

  return interaction.editReply({ embeds: [embed] });
}

/**
 * Remove context
 */
async function removeContext(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });

  const success = await contextService.deleteGuildContext(interaction.guildId!);

  if (success) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Context Removed",
          "AI context has been successfully removed from this server.",
          undefined,
          "Green"
        ),
      ],
    });
  } else {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Removal Failed",
          "Failed to remove AI context. It may not exist.",
          undefined,
          "Red"
        ),
      ],
    });
  }
}

/**
 * Toggle bot context
 */
async function toggleBotContext(interaction: ChatInputCommandInteraction, client: Client) {
  const enabled = interaction.options.getBoolean("enabled", true);

  await interaction.deferReply({ ephemeral: true });

  const success = await contextService.updateGuildSettings(interaction.guildId!, {
    useBotContext: enabled,
  });

  if (success) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Bot Context Updated",
          `Bot knowledge has been ${enabled ? "enabled" : "disabled"} for AI responses.`,
          undefined,
          "Green"
        ),
      ],
    });
  } else {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Update Failed",
          "Failed to update bot context setting.",
          undefined,
          "Red"
        ),
      ],
    });
  }
}

/**
 * Toggle custom context
 */
async function toggleCustomContext(interaction: ChatInputCommandInteraction, client: Client) {
  const enabled = interaction.options.getBoolean("enabled", true);

  await interaction.deferReply({ ephemeral: true });

  const success = await contextService.updateGuildSettings(interaction.guildId!, {
    useCustomContext: enabled,
  });

  if (success) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Custom Context Updated",
          `Custom context has been ${enabled ? "enabled" : "disabled"} for AI responses.`,
          undefined,
          "Green"
        ),
      ],
    });
  } else {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Update Failed",
          "Failed to update custom context setting.",
          undefined,
          "Red"
        ),
      ],
    });
  }
}

/**
 * Set context priority
 */
async function setPriority(interaction: ChatInputCommandInteraction, client: Client) {
  const priority = interaction.options.getString("priority", true) as "bot" | "custom" | "both";

  await interaction.deferReply({ ephemeral: true });

  const success = await contextService.updateGuildSettings(interaction.guildId!, {
    priority,
  });

  if (success) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Priority Updated",
          `Context priority has been set to: ${
            priority.charAt(0).toUpperCase() + priority.slice(1)
          }`,
          undefined,
          "Green"
        ),
      ],
    });
  } else {
    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "Update Failed", "Failed to update context priority.", undefined, "Red"),
      ],
    });
  }
}

/**
 * Export context
 */
async function exportContext(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });

  const { data: context, error } = await tryCatch(
    contextService.getGuildContext(interaction.guildId!)
  );

  if (error || !context) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "Export Failed", "No context found to export.", undefined, "Red"),
      ],
    });
  }

  try {
    const filename = `ai-context-${interaction.guild?.name?.replace(/[^a-zA-Z0-9]/g, "-")}-${
      new Date().toISOString().split("T")[0]
    }.md`;
    const attachment = new AttachmentBuilder(Buffer.from(context.content, "utf-8"), {
      name: filename,
    });

    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Context Exported",
          "Your AI context has been exported as a file.",
          undefined,
          "Green"
        ),
      ],
      files: [attachment],
    });
  } catch (error) {
    log.error("Error exporting context:", error);
    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "Export Error", "Failed to export context file.", undefined, "Red"),
      ],
    });
  }
}
