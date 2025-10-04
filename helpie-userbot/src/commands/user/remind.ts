/**
 * Remind Command
 * Create a reminder that will be sent via DM at a specified time
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import HelpieReplies from "../../utils/HelpieReplies";
import ReminderService from "../../utils/ReminderService";
import log from "../../utils/log";
import ms from "ms";

export const data = new SlashCommandBuilder()
  .setName("remind")
  .setDescription("Set a reminder for yourself")
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
  .addStringOption((option) => option.setName("time").setDescription("When to remind you (e.g., 30m, 2h, 1d, 1w)").setRequired(true))
  .addStringOption((option) => option.setName("reminder").setDescription("What to remind you about").setRequired(true).setMinLength(1).setMaxLength(1024));

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  await HelpieReplies.deferThinking(interaction, true);

  try {
    const timeString = interaction.options.getString("time", true);
    const content = interaction.options.getString("reminder", true);

    // Parse time string
    let totalMs = 0;
    const timeStringArr = timeString.split(" ");

    for (const timeStr of timeStringArr) {
      try {
        const trimmed = timeStr.trim();
        const parsed = ms(trimmed as any) as unknown as number; // ms library returns number for string input
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
    if (totalMs < 30000) {
      return HelpieReplies.editWarning(interaction, {
        title: "Time Too Short",
        message: "Reminder time must be at least 30 seconds.",
      });
    }

    // Validate maximum time (1 year)
    const maxTime = 365 * 24 * 60 * 60 * 1000;
    if (totalMs > maxTime) {
      return HelpieReplies.editWarning(interaction, {
        title: "Time Too Long",
        message: "Reminder time cannot be more than 1 year.",
      });
    }

    // Calculate reminder time
    const remindAt = new Date(Date.now() + totalMs);

    // Create reminder
    const reminderService = new ReminderService(client);
    const result = await reminderService.createReminder({
      userId: interaction.user.id,
      content: content,
      remindAt: remindAt,
      guildId: interaction.guildId || undefined,
    });

    if (!result.success) {
      return HelpieReplies.editError(interaction, {
        title: "Failed to Create Reminder",
        message: result.error || "Unknown error occurred",
      });
    }

    log.info(`User ${interaction.user.tag} created reminder: ${content} at ${remindAt.toISOString()}`);

    // Format the time nicely
    const readableTime = ms(totalMs, { long: true });
    const timestamp = Math.floor(remindAt.getTime() / 1000);

    return HelpieReplies.editSuccess(interaction, {
      title: "⏰ Reminder Set",
      message: `I'll remind you **${readableTime}** from now!\n\n**Reminder:** ${content}\n**When:** <t:${timestamp}:F> (<t:${timestamp}:R>)\n\n*You'll receive a DM when it's time.*`,
    });
  } catch (error: any) {
    log.error("Failed to create reminder:", error);

    return HelpieReplies.editError(interaction, {
      title: "Reminder Creation Failed",
      message: `Failed to create reminder: ${error.message || "Unknown error"}`,
    });
  }
}
