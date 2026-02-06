/**
 * TicketQuestionHandler - Multi-step question flow for ticket creation
 */

import type { ButtonInteraction, StringSelectMenuInteraction, ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonStyle } from "discord.js";
import { nanoid } from "nanoid";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import { TicketSessionService } from "../services/TicketSessionService.js";
import { TicketLifecycleService } from "../services/TicketLifecycleService.js";
import type { SelectQuestion, ModalQuestion } from "../models/TicketCategory.js";
import { InteractionFlow } from "./InteractionFlow.js";
import { createTicketFromSession } from "./TicketCreator.js";
import { MAX_MODAL_QUESTIONS } from "../types/index.js";

/**
 * Ask a select menu question
 */
export async function askSelectQuestion(lib: LibAPI, flow: InteractionFlow, sessionId: string, questions: SelectQuestion[], sessionService: TicketSessionService, logger: PluginLogger): Promise<void> {
  const session = await sessionService.getSession(sessionId);
  if (!session) {
    await flow.send({ content: "❌ Session expired.", ephemeral: true });
    return;
  }

  const currentStep = session.currentStep;
  const question = questions[currentStep];
  if (!question) {
    logger.warn(`No question found at step ${currentStep} for session ${sessionId}`);
    return;
  }

  const selectMenu = lib.createStringSelectMenuBuilderPersistent("ticket.question.select", {
    sessionId,
    questionId: question.id,
  });

  selectMenu.setPlaceholder(question.placeholder || "Select an option...");
  selectMenu.addOptions(
    question.options.map((opt) => ({
      label: opt.label,
      value: opt.value,
      description: opt.description,
      emoji: opt.emoji,
    })),
  );

  await selectMenu.ready();

  const row = new ActionRowBuilder<any>().addComponents(selectMenu);
  await flow.send({
    content: `**${question.label}**`,
    components: [row],
    ephemeral: true,
  });
}

/**
 * Ask modal questions (up to 5 per modal)
 */
export async function askModalQuestions(
  lib: LibAPI,
  interaction: ButtonInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction,
  sessionId: string,
  questions: ModalQuestion[],
  sessionService: TicketSessionService,
  logger: PluginLogger,
): Promise<void> {
  try {
    const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
    const totalPages = Math.ceil(sortedQuestions.length / MAX_MODAL_QUESTIONS);

    await sessionService.updateSession(sessionId, {
      totalModalPages: totalPages,
      currentModalPage: 0,
    });

    const session = await sessionService.getSession(sessionId);
    if (!session) {
      logger.error(`Session ${sessionId} not found`);
      return;
    }

    const currentPage = session.currentModalPage ?? 0;
    const startIndex = currentPage * MAX_MODAL_QUESTIONS;
    const questionsForPage = sortedQuestions.slice(startIndex, startIndex + MAX_MODAL_QUESTIONS);

    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle(totalPages > 1 ? `Ticket Information (${currentPage + 1}/${totalPages})` : "Ticket Information");

    for (const question of questionsForPage) {
      const input = new TextInputBuilder()
        .setCustomId(question.id)
        .setLabel(question.label)
        .setStyle(question.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(question.required);

      if (question.placeholder) input.setPlaceholder(question.placeholder);
      if (question.minLength) input.setMinLength(question.minLength);
      if (question.maxLength) input.setMaxLength(question.maxLength);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    await interaction.showModal(modal);

    // Wait for modal submission
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
      time: 900_000, // 15 minutes
    });

    await handleModalSubmit(lib, modalSubmit, sessionId, questionsForPage, sessionService, logger);
  } catch (error) {
    logger.error("Error in askModalQuestions:", error);
  }
}

/**
 * Handle modal submission
 */
async function handleModalSubmit(
  lib: LibAPI,
  interaction: ModalSubmitInteraction,
  sessionId: string,
  questions: ModalQuestion[],
  sessionService: TicketSessionService,
  logger: PluginLogger,
): Promise<void> {
  const flow = new InteractionFlow(interaction);

  try {
    // Collect answers
    const answers: Record<string, string> = {};
    for (const question of questions) {
      answers[question.id] = interaction.fields.getTextInputValue(question.id);
    }

    const session = await sessionService.getSession(sessionId);
    if (!session) {
      await flow.send({ content: "❌ Session expired.", ephemeral: true });
      return;
    }

    const currentPage = session.currentModalPage ?? 0;
    const totalPages = session.totalModalPages ?? 1;

    // Store answers
    for (const [questionId, value] of Object.entries(answers)) {
      await sessionService.setModalAnswer(sessionId, questionId, value);
    }

    logger.info(`Modal page ${currentPage + 1}/${totalPages} answers recorded for session ${sessionId}`);

    // Build review embed
    const embed = lib
      .createEmbedBuilder()
      .setTitle(`📋 Review Your Answers${totalPages > 1 ? ` (Page ${currentPage + 1}/${totalPages})` : ""}`)
      .setDescription("Please review your answers below.")
      .setColor("Blue");

    const answerFields: string[] = [];
    for (const question of questions) {
      const answer = answers[question.id];
      const truncated = answer && answer.length > 100 ? answer.substring(0, 100) + "..." : answer || "_No answer_";
      answerFields.push(`**${question.label}**\n${truncated}`);
    }
    embed.addFields({ name: "Your Answers", value: answerFields.join("\n\n") });

    // Build Continue and Edit buttons
    const continueButton = lib.createButtonBuilderPersistent("ticket.modal.continue", {
      sessionId,
      modalPage: currentPage,
    });
    continueButton
      .setLabel(currentPage < totalPages - 1 ? "Continue to Next Page" : "Submit & Create Ticket")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success);
    await continueButton.ready();

    const editButton = lib.createButtonBuilderPersistent("ticket.modal.edit", {
      sessionId,
      modalPage: currentPage,
    });
    editButton.setLabel("Edit Answers").setEmoji("✏️").setStyle(ButtonStyle.Secondary);
    await editButton.ready();

    const row = new ActionRowBuilder<any>().addComponents(continueButton, editButton);

    await flow.update({ embeds: [embed], components: [row], content: "" }, interaction);
  } catch (error) {
    logger.error("Error in handleModalSubmit:", error);
    await flow.send({ content: "❌ An error occurred.", ephemeral: true });
  }
}

/**
 * Handle select question answer
 */
export async function handleSelectAnswer(
  client: HeimdallClient,
  lib: LibAPI,
  interaction: StringSelectMenuInteraction,
  sessionId: string,
  questionId: string,
  sessionService: TicketSessionService,
  lifecycleService: TicketLifecycleService,
  category: { selectQuestions?: SelectQuestion[]; modalQuestions?: ModalQuestion[] },
  logger: PluginLogger,
): Promise<void> {
  const flow = new InteractionFlow(interaction);

  const value = interaction.values[0];
  if (!value) {
    await flow.send({ content: "❌ No option selected.", ephemeral: true });
    return;
  }
  await sessionService.setSelectAnswer(sessionId, questionId, value);

  const session = await sessionService.advanceStep(sessionId);
  if (!session) {
    await flow.send({ content: "❌ Session expired.", ephemeral: true });
    return;
  }

  const selectQuestions = category.selectQuestions || [];
  const modalQuestions = category.modalQuestions || [];

  // Check if more select questions
  if (session.currentStep < selectQuestions.length) {
    await askSelectQuestion(lib, flow, sessionId, selectQuestions, sessionService, logger);
    return;
  }

  // Check if modal questions
  if (modalQuestions.length > 0) {
    const openFormButton = lib.createButtonBuilder(async (btnInteraction) => {
      await askModalQuestions(lib, btnInteraction, sessionId, modalQuestions, sessionService, logger);
    }, 300);
    openFormButton.setLabel("📝 Open Form").setStyle(ButtonStyle.Primary);
    await openFormButton.ready();

    const row = new ActionRowBuilder<any>().addComponents(openFormButton);
    await flow.update({
      content: "📋 Please click the button below to complete the form:",
      components: [row],
    });
    return;
  }

  // No more questions - create ticket
  await flow.update({ content: "✅ Creating your ticket...", components: [] });

  const result = await createTicketFromSession(client, lib, sessionService, lifecycleService, sessionId, logger);

  if (!result.success) {
    await flow.show({ content: `❌ ${result.message}` });
    return;
  }

  await flow.show({ content: `✅ Your ticket has been created! <#${result.ticket?.channelId}>` });
}

/**
 * Handle modal continue button - proceed to next page or create ticket
 */
export async function handleModalContinue(
  client: HeimdallClient,
  lib: LibAPI,
  interaction: ButtonInteraction,
  sessionId: string,
  modalPage: number,
  sessionService: TicketSessionService,
  lifecycleService: TicketLifecycleService,
  logger: PluginLogger,
): Promise<void> {
  const flow = new InteractionFlow(interaction);

  const session = await sessionService.getSession(sessionId);
  if (!session) {
    await flow.send({ content: "❌ Session expired.", ephemeral: true });
    return;
  }

  const totalPages = session.totalModalPages ?? 1;
  const currentPage = session.currentModalPage ?? 0;

  if (currentPage < totalPages - 1) {
    // More pages - show next modal
    await sessionService.updateSession(sessionId, {
      currentModalPage: currentPage + 1,
    });

    // Get category to fetch modal questions
    const TicketCategory = (await import("../models/TicketCategory.js")).default;
    const category = await TicketCategory.findOne({ id: session.categoryId });
    if (!category || !category.modalQuestions) {
      await flow.send({ content: "❌ Category not found.", ephemeral: true });
      return;
    }

    const sortedQuestions = [...category.modalQuestions].sort((a, b) => a.order - b.order);
    const nextPage = currentPage + 1;
    const startIndex = nextPage * MAX_MODAL_QUESTIONS;
    const questionsForPage = sortedQuestions.slice(startIndex, startIndex + MAX_MODAL_QUESTIONS);

    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Ticket Information (${nextPage + 1}/${totalPages})`);

    for (const question of questionsForPage) {
      const input = new TextInputBuilder()
        .setCustomId(question.id)
        .setLabel(question.label)
        .setStyle(question.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(question.required);

      if (question.placeholder) input.setPlaceholder(question.placeholder);
      if (question.minLength) input.setMinLength(question.minLength);
      if (question.maxLength) input.setMaxLength(question.maxLength);

      // Pre-fill with existing answer if any
      const existingAnswer = session.modalAnswers[question.id];
      if (existingAnswer) input.setValue(existingAnswer);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    await interaction.showModal(modal);

    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 900_000,
      });

      await handleModalSubmit(lib, modalSubmit, sessionId, questionsForPage, sessionService, logger);
    } catch (error) {
      logger.debug("Modal submit timed out or was cancelled");
    }
  } else {
    // All pages complete - create ticket
    await flow.update({ content: "✅ Creating your ticket...", components: [] });

    const result = await createTicketFromSession(client, lib, sessionService, lifecycleService, sessionId, logger);

    if (!result.success) {
      await flow.show({ content: `❌ ${result.message}` });
      return;
    }

    await flow.show({
      content: `✅ Your ticket has been created! <#${result.ticket?.channelId}>`,
    });
  }
}

/**
 * Handle modal edit button - re-show the modal for editing
 */
export async function handleModalEdit(lib: LibAPI, interaction: ButtonInteraction, sessionId: string, modalPage: number, sessionService: TicketSessionService, logger: PluginLogger): Promise<void> {
  const session = await sessionService.getSession(sessionId);
  if (!session) {
    const flow = new InteractionFlow(interaction);
    await flow.send({ content: "❌ Session expired.", ephemeral: true });
    return;
  }

  // Get category to fetch modal questions
  const TicketCategory = (await import("../models/TicketCategory.js")).default;
  const category = await TicketCategory.findOne({ id: session.categoryId });
  if (!category || !category.modalQuestions) {
    const flow = new InteractionFlow(interaction);
    await flow.send({ content: "❌ Category not found.", ephemeral: true });
    return;
  }

  const totalPages = session.totalModalPages ?? 1;
  const sortedQuestions = [...category.modalQuestions].sort((a, b) => a.order - b.order);
  const startIndex = modalPage * MAX_MODAL_QUESTIONS;
  const questionsForPage = sortedQuestions.slice(startIndex, startIndex + MAX_MODAL_QUESTIONS);

  const modalId = nanoid();
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(totalPages > 1 ? `Edit Answers (${modalPage + 1}/${totalPages})` : "Edit Answers");

  for (const question of questionsForPage) {
    const input = new TextInputBuilder()
      .setCustomId(question.id)
      .setLabel(question.label)
      .setStyle(question.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(question.required);

    if (question.placeholder) input.setPlaceholder(question.placeholder);
    if (question.minLength) input.setMinLength(question.minLength);
    if (question.maxLength) input.setMaxLength(question.maxLength);

    // Pre-fill with existing answer
    const existingAnswer = session.modalAnswers[question.id];
    if (existingAnswer) input.setValue(existingAnswer);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  await interaction.showModal(modal);

  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
      time: 900_000,
    });

    await handleModalSubmit(lib, modalSubmit, sessionId, questionsForPage, sessionService, logger);
  } catch (error) {
    logger.debug("Modal edit timed out or was cancelled");
  }
}
