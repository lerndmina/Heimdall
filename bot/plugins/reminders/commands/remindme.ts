/**
 * /remindme <time> <message> — Quick reminder shortcut
 *
 * Creates a reminder that fires at the specified time. Automatically
 * detects ticket/modmail context from the current channel.
 */

import { SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { RemindersPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("remindme")
  .setDescription("Set a personal reminder")
  .addStringOption((opt) => opt.setName("time").setDescription('When to remind you (e.g. "30m", "2h", "tomorrow at 3pm")').setRequired(true))
  .addStringOption((opt) => opt.setName("message").setDescription("What to remind you about").setRequired(true).setMaxLength(1000));

export const config = {
  allowInDMs: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;

  const pluginAPI = getPluginAPI<RemindersPluginAPI>("reminders");
  if (!pluginAPI) {
    await interaction.reply({ content: "❌ Reminders plugin not loaded.", ephemeral: true });
    return;
  }

  const { reminderService, lib } = pluginAPI;

  const timeInput = interaction.options.getString("time", true);
  const message = interaction.options.getString("message", true);

  // Parse the time input
  const parsed = lib.parseTime(timeInput);
  if (!parsed) {
    await interaction.reply({
      content: "❌ Couldn't understand that time. Try something like `30m`, `2h`, `1d`, or `tomorrow at 3pm`.",
      ephemeral: true,
    });
    return;
  }

  if (parsed.isPast) {
    await interaction.reply({
      content: "❌ That time is in the past. Please specify a future time.",
      ephemeral: true,
    });
    return;
  }

  // Detect context (ticket/modmail) from current channel
  const guildId = interaction.guildId ?? "dm";
  const channelId = interaction.channelId;
  let contextData: { contextType?: string; contextId?: string; contextData?: Record<string, unknown> } = {};

  if (interaction.guildId) {
    const detected = await reminderService.getContextService().detectContext(channelId, interaction.guildId);
    if (detected) {
      contextData = {
        contextType: detected.contextType,
        contextId: detected.contextId,
        contextData: detected.contextData as Record<string, unknown>,
      };
    }
  }

  // Get guild name for DM delivery
  let guildName: string | undefined;
  if (interaction.guildId) {
    const guild = await lib.thingGetter.getGuild(interaction.guildId);
    guildName = guild?.name;
  }

  try {
    await reminderService.createReminder({
      userId: interaction.user.id,
      guildId,
      channelId,
      message,
      triggerAt: parsed.date,
      sourceChannelId: channelId,
      guildName,
      ...contextData,
    });

    // Build confirmation
    const contextNote = contextData.contextType ? ` (linked to ${contextData.contextType})` : "";

    await interaction.reply({
      content: `✅ I'll remind you ${time(parsed.date, TimestampStyles.RelativeTime)} — **${message}**${contextNote}`,
      ephemeral: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("Maximum")) {
      await interaction.reply({
        content: `❌ ${errorMessage}. Delete some old reminders with \`/reminders\` first.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({ content: `❌ Failed to create reminder: ${errorMessage}`, ephemeral: true });
    }
  }
}
