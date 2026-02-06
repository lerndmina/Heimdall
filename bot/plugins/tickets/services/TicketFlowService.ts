/**
 * TicketFlowService - Orchestrates the user journey for opening tickets
 */

import type { ButtonInteraction, StringSelectMenuInteraction, ChatInputCommandInteraction } from "discord.js";
import { ActionRowBuilder, ButtonStyle } from "discord.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import TicketCategory, { type ITicketCategory } from "../models/TicketCategory.js";
import { TicketSessionService } from "./TicketSessionService.js";
import { TicketLifecycleService } from "./TicketLifecycleService.js";
import { TicketCategoryService } from "./TicketCategoryService.js";
import { InteractionFlow } from "../utils/InteractionFlow.js";
import { askSelectQuestion, askModalQuestions } from "../utils/TicketQuestionHandler.js";
import { createTicketFromSession } from "../utils/TicketCreator.js";
import { CategoryType } from "../types/index.js";

export class TicketFlowService {
  constructor(
    private client: HeimdallClient,
    private logger: PluginLogger,
    private lib: LibAPI,
    private sessionService: TicketSessionService,
    private lifecycleService: TicketLifecycleService,
    private categoryService: TicketCategoryService,
  ) {}

  /**
   * Entry point for all ticket creation flows
   */
  async openTicketForUser(
    categoryId: string,
    subjectId: string,
    openerId: string,
    interaction: ButtonInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction,
    openReason?: string,
  ): Promise<void> {
    const flow = new InteractionFlow(interaction);

    try {
      // Fetch and validate category
      const category = await this.categoryService.getCategory(categoryId);
      if (!category) {
        await flow.send({ content: "❌ Category not found or has been deleted.", ephemeral: true });
        return;
      }

      if (!category.isActive) {
        await flow.send({ content: "❌ This category is currently disabled.", ephemeral: true });
        return;
      }

      const isValid = await this.categoryService.validateCategoryHierarchy(categoryId);
      if (!isValid) {
        await flow.send({ content: "❌ This category has invalid configuration. Please contact an administrator.", ephemeral: true });
        return;
      }

      // Parent category → show child selector, Child category → proceed with ticket
      if (category.type === CategoryType.PARENT) {
        await this.showChildCategorySelector(flow, category, subjectId, openerId, openReason);
      } else {
        await this.openTicket(flow, category, subjectId, openerId, openReason);
      }
    } catch (error) {
      this.logger.error("Error in openTicketForUser:", error);
      try {
        await flow.send({ content: "❌ An error occurred while opening your ticket. Please try again later.", ephemeral: true });
      } catch (e) {
        // If we can't send error, rely on global handlers
      }
    }
  }

  /**
   * Show child category selector for parent categories
   */
  private async showChildCategorySelector(flow: InteractionFlow, parentCategory: ITicketCategory, subjectId: string, openerId: string, openReason?: string): Promise<void> {
    const children = await TicketCategory.find({
      guildId: parentCategory.guildId,
      parentId: parentCategory.id,
      isActive: true,
    }).sort({ name: 1 });

    if (children.length === 0) {
      await flow.send({ content: `❌ ${parentCategory.name} has no available sub-categories.`, components: [], ephemeral: true });
      return;
    }

    // Build ephemeral select menu with callback using lib's builder
    const menu = this.lib.createStringSelectMenuBuilder(
      async (selectInteraction) => {
        if (!selectInteraction.isStringSelectMenu()) return;

        const selectedCategoryId = selectInteraction.values[0];
        const selectedCategory = await TicketCategory.findOne({
          id: selectedCategoryId,
          guildId: parentCategory.guildId,
          isActive: true,
        });

        const newFlow = new InteractionFlow(selectInteraction);

        if (!selectedCategory) {
          await newFlow.update({ content: "❌ Selected category not found.", components: [] });
          return;
        }

        await newFlow.update({ content: "✅ Category selected. Opening ticket...", components: [] });
        await this.openTicket(newFlow, selectedCategory, subjectId, openerId, openReason);
      },
      900, // 15 minute TTL
    );

    menu.setPlaceholder(`Select ${parentCategory.name} type...`).addOptions(
      children.map((child) => {
        const option: any = {
          label: child.name,
          value: child.id,
          description: child.description?.substring(0, 100),
        };
        if (child.emoji) option.emoji = child.emoji;
        return option;
      }),
    );

    await menu.ready();

    const row = new ActionRowBuilder<any>().addComponents(menu);
    await flow.send({ content: `Please select a ${parentCategory.name} category:`, components: [row], ephemeral: true });
  }

  /**
   * Open ticket after category is determined
   */
  private async openTicket(flow: InteractionFlow, category: ITicketCategory, subjectId: string, openerId: string, openReason?: string): Promise<void> {
    // Check for existing active session
    const existingSession = await this.sessionService.getSessionByUser(subjectId);
    if (existingSession) {
      await this.handleExistingSession(flow, existingSession.sessionId, subjectId, category, openerId, openReason);
      return;
    }

    // Create new session
    const sessionId = await this.sessionService.createSession({
      guildId: category.guildId,
      userId: subjectId,
      subjectId,
      openerId,
      categoryId: category.id,
      openReason,
    });

    this.logger.info(`Created ticket session ${sessionId} for user ${subjectId} in category ${category.name}`);

    // Check for questions
    const hasSelectQuestions = category.selectQuestions && category.selectQuestions.length > 0;
    const hasModalQuestions = category.modalQuestions && category.modalQuestions.length > 0;

    if (!hasSelectQuestions && !hasModalQuestions) {
      // No questions - create ticket immediately
      await flow.send({ content: "✅ Creating your ticket...", components: [], ephemeral: true });

      const result = await createTicketFromSession(this.client, this.lib, this.sessionService, this.lifecycleService, sessionId, this.logger);

      if (!result.success) {
        await flow.show({ content: `❌ ${result.message}` });
        return;
      }

      await flow.show({ content: `✅ Your ticket has been created! <#${result.ticket?.channelId}>` });
      return;
    }

    // Has questions - start question flow
    if (hasSelectQuestions) {
      // Start select question flow
      await askSelectQuestion(this.lib, flow, sessionId, category.selectQuestions!, this.sessionService, this.logger);
    } else if (hasModalQuestions) {
      // Show modal button (modals need an interaction context to show)
      const openFormButton = this.lib.createButtonBuilder(async (btnInteraction) => {
        await askModalQuestions(this.lib, btnInteraction, sessionId, category.modalQuestions!, this.sessionService, this.logger);
      }, 300);
      openFormButton.setLabel("📝 Open Form").setStyle(ButtonStyle.Primary);
      await openFormButton.ready();

      const row = new ActionRowBuilder<any>().addComponents(openFormButton);
      await flow.send({
        content: "📋 Please click the button below to complete the form:",
        components: [row],
        ephemeral: true,
      });
    }
  }

  /**
   * Handle case where user has an existing session
   */
  private async handleExistingSession(flow: InteractionFlow, existingSessionId: string, subjectId: string, category: ITicketCategory, openerId: string, openReason?: string): Promise<void> {
    // Create cancel button
    const cancelButton = this.lib.createButtonBuilder(
      async (buttonInteraction) => {
        const buttonFlow = new InteractionFlow(buttonInteraction);

        const confirmButton = this.lib.createButtonBuilder(async (confirmInteraction) => {
          const confirmFlow = new InteractionFlow(confirmInteraction);
          await this.sessionService.deleteSession(existingSessionId);
          await confirmFlow.update({ content: "✅ Your previous ticket session has been cancelled. You can now start a new ticket.", components: [] });
          this.logger.info(`User ${subjectId} cancelled session ${existingSessionId}`);
        }, 60);
        confirmButton.setLabel("Yes, Delete Progress").setStyle(ButtonStyle.Danger);

        const keepButton = this.lib.createButtonBuilder(async (keepInteraction) => {
          const keepFlow = new InteractionFlow(keepInteraction);
          await keepFlow.update({ content: "❌ You already have an active ticket opening in progress.", components: [] });
        }, 60);
        keepButton.setLabel("No, Keep Progress").setStyle(ButtonStyle.Secondary);

        await confirmButton.ready();
        await keepButton.ready();

        const confirmRow = new ActionRowBuilder<any>().addComponents(confirmButton, keepButton);
        await buttonFlow.update({
          content: "⚠️ **Are you sure you want to cancel your current ticket session?**\n\nThis will permanently delete all your answers and progress.",
          components: [confirmRow],
        });
      },
      300, // 5 minute TTL
    );

    cancelButton.setLabel("🗑️ Cancel & Start Over").setStyle(ButtonStyle.Danger);
    await cancelButton.ready();

    const row = new ActionRowBuilder<any>().addComponents(cancelButton);
    await flow.send({
      content: "❌ You already have an active ticket opening in progress. Please complete or wait for it to expire.",
      components: [row],
      ephemeral: true,
    });
  }
}
