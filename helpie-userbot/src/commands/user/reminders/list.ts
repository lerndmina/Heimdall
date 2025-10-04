/**
 * List Reminders Command
 * Shows all active reminders for the user
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType, EmbedBuilder } from "discord.js";
import HelpieReplies from "../../../utils/HelpieReplies";
import ReminderService from "../../../utils/ReminderService";
import log from "../../../utils/log";

export const data = new SlashCommandBuilder().setName("list").setDescription("View all your active reminders");

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  await HelpieReplies.deferThinking(interaction, true);

  try {
    const reminderService = new ReminderService(client);
    const reminders = await reminderService.getUserReminders(interaction.user.id);

    if (reminders.length === 0) {
      return HelpieReplies.editSuccess(interaction, {
        title: "No Active Reminders",
        message: "You don't have any active reminders set.\n\nCreate one with `/helpie remind` or by right-clicking a message!",
      });
    }

    // Build embed with reminders
    const embed = new EmbedBuilder()
      .setColor(0x5865f2) // Blurple
      .setTitle(`⏰ Your Reminders (${reminders.length})`)
      .setDescription(`You have ${reminders.length} active reminder${reminders.length === 1 ? "" : "s"}`)
      .setTimestamp();

    // Add each reminder as a field (max 25 fields)
    const displayReminders = reminders.slice(0, 25);

    for (let i = 0; i < displayReminders.length; i++) {
      const reminder = displayReminders[i];
      const timestamp = Math.floor(new Date(reminder.remindAt).getTime() / 1000);

      let fieldValue = `**When:** <t:${timestamp}:F> (<t:${timestamp}:R>)\n**Content:** ${reminder.content.substring(0, 100)}${reminder.content.length > 100 ? "..." : ""}`;

      if (reminder.messageUrl) {
        fieldValue += `\n**Link:** [Jump to Message](${reminder.messageUrl})`;
      }

      embed.addFields({
        name: `${i + 1}. Reminder`,
        value: fieldValue,
        inline: false,
      });
    }

    if (reminders.length > 25) {
      embed.setFooter({
        text: `Showing first 25 of ${reminders.length} reminders`,
      });
    }

    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error: any) {
    log.error("Failed to list reminders:", error);

    return HelpieReplies.editError(interaction, {
      title: "Failed to List Reminders",
      message: `Failed to retrieve reminders: ${error.message || "Unknown error"}`,
    });
  }
}
