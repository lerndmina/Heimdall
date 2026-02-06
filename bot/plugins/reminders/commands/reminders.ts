/**
 * /reminders — Interactive reminder management panel
 *
 * Displays paginated list of active reminders with buttons for
 * navigation, creation (via modal), editing, and deletion.
 */

import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonStyle,
  time,
  TimestampStyles,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { nanoid } from "nanoid";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { RemindersPluginAPI } from "../index.js";
import type { LibAPI } from "../../lib/index.js";
import type { ReminderService } from "../services/ReminderService.js";
import type { IReminder } from "../models/Reminder.js";

const PAGE_SIZE = 5;
const COMPONENT_TTL = 300; // 5 minutes

type ReminderDoc = IReminder & { _id: any; createdAt: Date; updatedAt: Date };

export const data = new SlashCommandBuilder().setName("reminders").setDescription("View and manage your reminders");

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

  await showReminderPanel(interaction, pluginAPI.reminderService, pluginAPI.lib, 0);
}

// ── Panel Rendering ──────────────────────────────────────

async function showReminderPanel(interaction: ChatInputCommandInteraction | ButtonInteraction, service: ReminderService, lib: LibAPI, page: number): Promise<void> {
  const userId = interaction.user.id;
  const { reminders, total } = await service.getUserReminders(userId, {
    sort: "triggerAt",
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const embed = lib
    .createEmbedBuilder()
    .setTitle("📋 Your Reminders")
    .setColor(0x5865f2)
    .setFooter({ text: `Page ${currentPage + 1}/${totalPages} • ${total} reminder${total === 1 ? "" : "s"}` });

  if (reminders.length === 0) {
    embed.setDescription("You have no active reminders.\nUse `/remindme` or the **Create** button below to set one.");
  } else {
    const lines = reminders.map((r, i) => {
      const idx = currentPage * PAGE_SIZE + i + 1;
      const triggerTime = time(r.triggerAt, TimestampStyles.RelativeTime);
      const contextBadge = r.contextType ? ` 🏷️ ${r.contextType}` : "";
      const truncMsg = r.message.length > 60 ? `${r.message.slice(0, 57)}...` : r.message;
      return `**${idx}.** ${truncMsg}\n    ⏰ ${triggerTime}${contextBadge}`;
    });
    embed.setDescription(lines.join("\n\n"));
  }

  // Build component rows
  const rows = await buildPanelComponents(interaction, service, lib, reminders, currentPage, totalPages);

  if (interaction.isCommand() || !interaction.replied) {
    if (interaction.isCommand()) {
      await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    } else {
      await interaction.update({ embeds: [embed], components: rows });
    }
  } else {
    await interaction.update({ embeds: [embed], components: rows });
  }
}

async function buildPanelComponents(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  service: ReminderService,
  lib: LibAPI,
  reminders: ReminderDoc[],
  currentPage: number,
  totalPages: number,
): Promise<ActionRowBuilder<any>[]> {
  const rows: ActionRowBuilder<any>[] = [];
  const userId = interaction.user.id;

  // Row 1: Select menu (if there are reminders)
  if (reminders.length > 0) {
    const selectMenu = lib.createStringSelectMenuBuilder(async (selectInteraction) => {
      const selectedId = selectInteraction.values[0];
      if (!selectedId) return;

      const reminder = await service.getReminder(selectedId, userId);
      if (!reminder) {
        await selectInteraction.reply({ content: "❌ Reminder not found.", ephemeral: true });
        return;
      }

      await showReminderDetail(selectInteraction, service, lib, reminder);
    }, COMPONENT_TTL);

    selectMenu.setPlaceholder("Select a reminder to view/edit/delete");

    for (const r of reminders) {
      const triggerStr = r.triggerAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const truncMsg = r.message.length > 50 ? `${r.message.slice(0, 47)}...` : r.message;
      selectMenu.addOptions({
        label: truncMsg,
        description: `Due: ${triggerStr}`,
        value: String(r._id),
      });
    }

    await selectMenu.ready();
    rows.push(new ActionRowBuilder<any>().addComponents(selectMenu));
  }

  // Row 2: Navigation + Create
  const prevButton = lib.createButtonBuilder(async (btnInteraction) => {
    await showReminderPanel(btnInteraction, service, lib, currentPage - 1);
  }, COMPONENT_TTL);
  prevButton
    .setLabel("◀")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage <= 0);
  await prevButton.ready();

  const nextButton = lib.createButtonBuilder(async (btnInteraction) => {
    await showReminderPanel(btnInteraction, service, lib, currentPage + 1);
  }, COMPONENT_TTL);
  nextButton
    .setLabel("▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage >= totalPages - 1);
  await nextButton.ready();

  const createButton = lib.createButtonBuilder(async (btnInteraction) => {
    await showCreateModal(btnInteraction, service, lib);
  }, COMPONENT_TTL);
  createButton.setLabel("Create").setStyle(ButtonStyle.Success).setEmoji("➕");
  await createButton.ready();

  rows.push(new ActionRowBuilder<any>().addComponents(prevButton, nextButton, createButton));

  return rows;
}

// ── Detail View ──────────────────────────────────────────

async function showReminderDetail(interaction: StringSelectMenuInteraction, service: ReminderService, lib: LibAPI, reminder: ReminderDoc): Promise<void> {
  const embed = lib
    .createEmbedBuilder()
    .setTitle("📝 Reminder Detail")
    .setColor(0x5865f2)
    .setDescription(reminder.message)
    .addFields(
      { name: "Due", value: time(reminder.triggerAt, TimestampStyles.RelativeTime), inline: true },
      { name: "Created", value: time(reminder.createdAt, TimestampStyles.RelativeTime), inline: true },
    );

  if (reminder.guildName) {
    embed.addFields({ name: "Server", value: reminder.guildName, inline: true });
  }

  if (reminder.contextType) {
    embed.addFields({ name: "Context", value: `🏷️ ${reminder.contextType}`, inline: true });
  }

  if (reminder.sourceChannelId) {
    embed.addFields({ name: "Channel", value: `<#${reminder.sourceChannelId}>`, inline: true });
  }

  // Edit button
  const editButton = lib.createButtonBuilder(async (btnInteraction) => {
    await showEditModal(btnInteraction, service, lib, String(reminder._id));
  }, COMPONENT_TTL);
  editButton.setLabel("Edit").setStyle(ButtonStyle.Primary).setEmoji("✏️");
  await editButton.ready();

  // Delete button
  const deleteButton = lib.createButtonBuilder(async (btnInteraction) => {
    await showDeleteConfirmation(btnInteraction, service, lib, reminder);
  }, COMPONENT_TTL);
  deleteButton.setLabel("Delete").setStyle(ButtonStyle.Danger).setEmoji("🗑️");
  await deleteButton.ready();

  // Back button
  const backButton = lib.createButtonBuilder(async (btnInteraction) => {
    await showReminderPanel(btnInteraction, service, lib, 0);
  }, COMPONENT_TTL);
  backButton.setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("◀");
  await backButton.ready();

  const row = new ActionRowBuilder<any>().addComponents(editButton, deleteButton, backButton);

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ── Create Modal ─────────────────────────────────────────

async function showCreateModal(interaction: ButtonInteraction, service: ReminderService, lib: LibAPI): Promise<void> {
  const modalId = nanoid();
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Create Reminder");

  const timeInput = new TextInputBuilder().setCustomId("time").setLabel("When? (e.g. 30m, 2h, tomorrow 3pm)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);

  const messageInput = new TextInputBuilder().setCustomId("message").setLabel("What to remind you about?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput), new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));

  await interaction.showModal(modal);

  let modalSubmit: ModalSubmitInteraction;
  try {
    modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
      time: 900_000,
    });
  } catch {
    return; // Timed out
  }

  await modalSubmit.deferReply({ ephemeral: true });

  const timeValue = modalSubmit.fields.getTextInputValue("time");
  const messageValue = modalSubmit.fields.getTextInputValue("message");

  const parsed = lib.parseTime(timeValue);
  if (!parsed) {
    await modalSubmit.editReply({
      content: "❌ Couldn't understand that time. Try something like `30m`, `2h`, or `tomorrow at 3pm`.",
    });
    return;
  }

  if (parsed.isPast) {
    await modalSubmit.editReply({ content: "❌ That time is in the past." });
    return;
  }

  // Detect context
  const guildId = interaction.guildId ?? "dm";
  const channelId = interaction.channelId;
  let contextData: Record<string, unknown> = {};

  if (interaction.guildId) {
    const detected = await service.getContextService().detectContext(channelId, interaction.guildId);
    if (detected) {
      contextData = {
        contextType: detected.contextType,
        contextId: detected.contextId,
        contextData: detected.contextData,
      };
    }
  }

  let guildName: string | undefined;
  if (interaction.guildId) {
    const guild = await lib.thingGetter.getGuild(interaction.guildId);
    guildName = guild?.name;
  }

  try {
    await service.createReminder({
      userId: interaction.user.id,
      guildId,
      channelId,
      message: messageValue,
      triggerAt: parsed.date,
      sourceChannelId: channelId,
      guildName,
      ...contextData,
    });

    await modalSubmit.editReply({
      content: `✅ Reminder created! I'll remind you ${time(parsed.date, TimestampStyles.RelativeTime)}.`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await modalSubmit.editReply({ content: `❌ ${errMsg}` });
  }
}

// ── Edit Modal ───────────────────────────────────────────

async function showEditModal(interaction: ButtonInteraction, service: ReminderService, lib: LibAPI, reminderId: string): Promise<void> {
  const reminder = await service.getReminder(reminderId, interaction.user.id);
  if (!reminder) {
    await interaction.reply({ content: "❌ Reminder not found.", ephemeral: true });
    return;
  }

  const modalId = nanoid();
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Edit Reminder");

  const messageInput = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("What to remind you about?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setValue(reminder.message);

  const timeInput = new TextInputBuilder().setCustomId("time").setLabel("New time (leave blank to keep current)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput), new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput));

  await interaction.showModal(modal);

  let modalSubmit: ModalSubmitInteraction;
  try {
    modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
      time: 900_000,
    });
  } catch {
    return;
  }

  await modalSubmit.deferReply({ ephemeral: true });

  const messageValue = modalSubmit.fields.getTextInputValue("message");
  const timeValue = modalSubmit.fields.getTextInputValue("time");

  const updates: { message?: string; triggerAt?: Date } = {};
  updates.message = messageValue;

  if (timeValue.trim()) {
    const parsed = lib.parseTime(timeValue);
    if (!parsed) {
      await modalSubmit.editReply({ content: "❌ Couldn't understand that time." });
      return;
    }
    if (parsed.isPast) {
      await modalSubmit.editReply({ content: "❌ That time is in the past." });
      return;
    }
    updates.triggerAt = parsed.date;
  }

  try {
    const updated = await service.updateReminder(reminderId, interaction.user.id, updates);
    if (!updated) {
      await modalSubmit.editReply({ content: "❌ Reminder not found or already triggered." });
      return;
    }

    const triggerDisplay = updates.triggerAt ? time(updates.triggerAt, TimestampStyles.RelativeTime) : time(reminder.triggerAt, TimestampStyles.RelativeTime);

    await modalSubmit.editReply({
      content: `✅ Reminder updated! Due ${triggerDisplay}.`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await modalSubmit.editReply({ content: `❌ ${errMsg}` });
  }
}

// ── Delete Confirmation ──────────────────────────────────

async function showDeleteConfirmation(interaction: ButtonInteraction, service: ReminderService, lib: LibAPI, reminder: ReminderDoc): Promise<void> {
  const embed = lib.createEmbedBuilder().setTitle("🗑️ Delete Reminder?").setColor(0xed4245).setDescription(`Are you sure you want to delete this reminder?\n\n> ${reminder.message}`);

  const confirmButton = lib.createButtonBuilder(async (btnInteraction) => {
    const deleted = await service.cancelReminder(String(reminder._id), interaction.user.id);
    if (deleted) {
      await btnInteraction.update({
        embeds: [lib.createEmbedBuilder().setTitle("✅ Deleted").setColor(0x57f287).setDescription("Reminder deleted successfully.")],
        components: [],
      });
    } else {
      await btnInteraction.update({
        embeds: [lib.createEmbedBuilder().setTitle("❌ Error").setColor(0xed4245).setDescription("Could not delete this reminder.")],
        components: [],
      });
    }
  }, COMPONENT_TTL);
  confirmButton.setLabel("Delete").setStyle(ButtonStyle.Danger);
  await confirmButton.ready();

  const cancelButton = lib.createButtonBuilder(async (btnInteraction) => {
    await showReminderPanel(btnInteraction, service, lib, 0);
  }, COMPONENT_TTL);
  cancelButton.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
  await cancelButton.ready();

  const row = new ActionRowBuilder<any>().addComponents(confirmButton, cancelButton);

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
