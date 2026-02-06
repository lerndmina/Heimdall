/**
 * QuestionManagementUI - UI builder for ticket question management
 */

import { ActionRowBuilder, ButtonStyle, type ColorResolvable, type EmbedBuilder } from "discord.js";
import type { ITicketCategory } from "../models/TicketCategory.js";
import type { LibAPI } from "../../lib/index.js";
import type { PluginAPI } from "../../../src/types/Plugin.js";

/**
 * UI builder for ticket question management
 */
export class QuestionManagementUI {
  /**
   * Build main panel showing all questions with management buttons
   */
  static async buildMainPanel(
    category: ITicketCategory,
    getPluginAPI: <T = PluginAPI>(name: string) => T | undefined,
  ): Promise<{
    embed: EmbedBuilder;
    components: ActionRowBuilder<any>[];
  }> {
    const lib = getPluginAPI<LibAPI>("lib")!;

    // Sort questions by order
    const sortedSelectQuestions = [...(category.selectQuestions || [])].sort((a, b) => a.order - b.order);
    const sortedModalQuestions = [...(category.modalQuestions || [])].sort((a, b) => a.order - b.order);

    // Build embed
    const embed = lib
      .createEmbedBuilder()
      .setTitle(`📋 Question Management: ${category.name}`)
      .setDescription(
        `Manage questions for this ticket category.\n\n` + `**Select Questions:** Pre-modal questions shown sequentially\n` + `**Modal Questions:** Text input questions (grouped into modals of 5)`,
      )
      .setColor("Blue" as ColorResolvable);

    // Add select questions field
    if (sortedSelectQuestions.length > 0) {
      const text = sortedSelectQuestions
        .map((q, idx) => {
          const required = q.required ? "✓" : "✗";
          return `${idx + 1}. **${q.label}** (${q.options.length} options) [Req: ${required}]`;
        })
        .join("\n");
      embed.addFields({ name: `🔹 Select Questions (${sortedSelectQuestions.length})`, value: text.substring(0, 1024) });
    } else {
      embed.addFields({ name: `🔹 Select Questions (0)`, value: "_No select questions_" });
    }

    // Add modal questions field
    if (sortedModalQuestions.length > 0) {
      const text = sortedModalQuestions
        .map((q, idx) => {
          const required = q.required ? "✓" : "✗";
          const style = q.style === "short" ? "Short" : "Paragraph";
          return `${idx + 1}. **${q.label}** [${style}, Req: ${required}]`;
        })
        .join("\n");
      embed.addFields({ name: `📝 Modal Questions (${sortedModalQuestions.length}/25)`, value: text.substring(0, 1024) });
    } else {
      embed.addFields({ name: `📝 Modal Questions (0/25)`, value: "_No modal questions_" });
    }

    // Build action buttons
    const components: ActionRowBuilder<any>[] = [];
    const row = new ActionRowBuilder<any>();

    // Add Select Question button
    const addSelectBtn = lib.createButtonBuilderPersistent("ticket.questions.add_select", {
      categoryId: category.id,
      guildId: category.guildId,
    });
    addSelectBtn.setLabel("Add Select").setEmoji("🔹").setStyle(ButtonStyle.Success);
    await addSelectBtn.ready();

    // Add Modal Question button
    const addModalBtn = lib.createButtonBuilderPersistent("ticket.questions.add_modal", {
      categoryId: category.id,
      guildId: category.guildId,
    });
    addModalBtn.setLabel("Add Modal").setEmoji("📝").setStyle(ButtonStyle.Success);
    addModalBtn.setDisabled(sortedModalQuestions.length >= 25);
    await addModalBtn.ready();

    // Refresh button
    const refreshBtn = lib.createButtonBuilderPersistent("ticket.questions.refresh", {
      categoryId: category.id,
      guildId: category.guildId,
    });
    refreshBtn.setLabel("Refresh").setEmoji("🔄").setStyle(ButtonStyle.Secondary);
    await refreshBtn.ready();

    row.addComponents(addSelectBtn, addModalBtn, refreshBtn);
    components.push(row);

    // Add question edit/delete buttons (up to 20 questions, 4 rows of 5)
    const allQuestions = [...sortedSelectQuestions.map((q) => ({ q, type: "select" as const })), ...sortedModalQuestions.map((q) => ({ q, type: "modal" as const }))];

    let currentRow = new ActionRowBuilder<any>();
    let btnCount = 0;
    const maxButtons = Math.min(allQuestions.length, 20);

    for (let i = 0; i < maxButtons; i++) {
      const item = allQuestions[i];
      if (!item) continue;
      const { q, type } = item;
      const handlerId = type === "select" ? "ticket.questions.edit_select" : "ticket.questions.edit_modal";

      const btn = lib.createButtonBuilderPersistent(handlerId, {
        questionId: q.id,
        categoryId: category.id,
        guildId: category.guildId,
      });
      btn
        .setLabel(q.label.substring(0, 40))
        .setEmoji(type === "select" ? "🔹" : "📝")
        .setStyle(ButtonStyle.Primary);
      await btn.ready();

      currentRow.addComponents(btn);
      btnCount++;

      if (btnCount % 5 === 0 && components.length < 5) {
        components.push(currentRow);
        currentRow = new ActionRowBuilder<any>();
      }
    }

    // Push remaining buttons
    if (btnCount % 5 !== 0 && components.length < 5) {
      components.push(currentRow);
    }

    return { embed, components };
  }
}
