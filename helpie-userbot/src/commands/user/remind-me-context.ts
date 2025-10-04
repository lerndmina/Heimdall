/**
 * Remind Me - Context Menu Command
 *
 * Right-click any message to set a reminder about it via modal
 */

import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageContextMenuCommandInteraction,
  Client,
  InteractionContextType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  ApplicationIntegrationType,
} from "discord.js";
import { CommandOptions } from "../../types/commands";
import HelpieReplies from "../../utils/HelpieReplies";
import ReminderService from "../../utils/ReminderService";
import log from "../../utils/log";
import ms from "ms";

export const data = new ContextMenuCommandBuilder()
  .setName("Remind -> Set Reminder")
  .setType(ApplicationCommandType.Message)
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel]);

export const options: CommandOptions = {
  deleted: false,
};

export async function run(interaction: MessageContextMenuCommandInteraction, client: Client) {
  // Get the target message
  const targetMessage = interaction.targetMessage;

  // Build message URL for reminder
  const messageUrl = targetMessage.url;

  // Extract message content for context
  let messageContent = targetMessage.content;

  // If message has no text content, check for embeds
  if (!messageContent || messageContent.trim().length === 0) {
    if (targetMessage.embeds.length > 0) {
      const embed = targetMessage.embeds[0];
      messageContent = `${embed.title || ""}${embed.title && embed.description ? " - " : ""}${embed.description || ""}`.trim();
    }
  }

  // Truncate content if too long
  if (messageContent.length > 100) {
    messageContent = messageContent.substring(0, 97) + "...";
  }

  const defaultContent = messageContent ? messageContent : "Reminder";

  // Show modal to get reminder details
  const modalId = `reminder_add_${targetMessage.id}_${interaction.user.id}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Set Reminder");

  const timeInput = new TextInputBuilder()
    .setCustomId("reminder_time")
    .setLabel("When to remind (e.g., 30m, 2h, 1d, 1w)")
    .setPlaceholder("30m")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(50);

  const contentInput = new TextInputBuilder()
    .setCustomId("reminder_content")
    .setLabel("What to remind you about")
    .setValue(defaultContent)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(1024);

  const rows: ActionRowBuilder<TextInputBuilder>[] = [new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput), new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput)];

  modal.addComponents(...rows);

  await interaction.showModal(modal);

  // Wait for modal submission
  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      time: ms("15m"),
      filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
    });

    await handleModalSubmit(modalSubmit, client, messageUrl, targetMessage.channelId, targetMessage.id, interaction.guildId);
  } catch (error) {
    // Modal timed out or was cancelled - no action needed
    log.debug("Reminder creation modal timed out or was cancelled");
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction, client: Client, messageUrl: string, channelId: string, messageId: string, guildId: string | null) {
  await HelpieReplies.deferThinking(interaction, true);

  try {
    const timeString = interaction.fields.getTextInputValue("reminder_time");
    const content = interaction.fields.getTextInputValue("reminder_content");

    // Parse time string
    let totalMs = 0;
    const timeStringArr = timeString.split(" ");

    for (const timeStr of timeStringArr) {
      try {
        const trimmed = timeStr.trim();
        const parsed = ms(trimmed as any) as unknown as number;
        if (!parsed || typeof parsed !== "number" || parsed <= 0) {
          return HelpieReplies.editWarning(interaction, {
            title: "Invalid Time Format",
            message: `Invalid time format: \`${timeStr}\`\n\nSupported formats:\n• \`30s\` - seconds\n• \`15m\` - minutes\n• \`2h\` - hours\n• \`3d\` - days\n• \`1w\` - weeks\n\nYou can combine them: \`1h 30m\``,
          });
        }
        totalMs += parsed;
      } catch (error) {
        return HelpieReplies.editWarning(interaction, {
          title: "Invalid Time Format",
          message: `Invalid time format: \`${timeStr}\`\n\nSupported formats:\n• \`30s\` - seconds\n• \`15m\` - minutes\n• \`2h\` - hours\n• \`3d\` - days\n• \`1w\` - weeks\n\nYou can combine them: \`1h 30m\``,
        });
      }
    }

    // Validate minimum time (30 seconds)
    if (totalMs < ms("30s")) {
      return HelpieReplies.editWarning(interaction, {
        title: "Time Too Short",
        message: "Reminder time must be at least 30 seconds.",
      });
    }

    // Validate maximum time (1 year)
    const maxTime = ms("1y");
    if (totalMs > maxTime) {
      return HelpieReplies.editWarning(interaction, {
        title: "Time Too Long",
        message: "Reminder time cannot be more than 1 year.",
      });
    } // Calculate reminder time
    const remindAt = new Date(Date.now() + totalMs);

    // Create reminder with message context
    const reminderService = new ReminderService(client);
    const result = await reminderService.createReminder({
      userId: interaction.user.id,
      content: content,
      remindAt: remindAt,
      messageUrl: messageUrl,
      channelId: channelId,
      messageId: messageId,
      guildId: guildId || undefined,
    });

    if (!result.success) {
      return HelpieReplies.editError(interaction, {
        title: "Failed to Create Reminder",
        message: result.error || "Unknown error occurred",
      });
    }

    log.info(`User ${interaction.user.tag} created reminder from message ${messageId}: ${content} at ${remindAt.toISOString()}`);

    // Format the time nicely
    const readableTime = ms(totalMs, { long: true });
    const timestamp = Math.floor(remindAt.getTime() / 1000);

    return HelpieReplies.editSuccess(interaction, {
      title: "⏰ Reminder Set",
      message: `I'll remind you **${readableTime}** from now!\n\n**Reminder:** ${content}\n**When:** <t:${timestamp}:F> (<t:${timestamp}:R>)\n**Message:** [Jump to Message](${messageUrl})\n\n*You'll receive a DM when it's time.*`,
    });
  } catch (error: any) {
    log.error("Failed to create reminder from context menu:", error);

    return HelpieReplies.editError(interaction, {
      title: "Reminder Creation Failed",
      message: `Failed to create reminder: ${error.message || "Unknown error"}`,
    });
  }
}
