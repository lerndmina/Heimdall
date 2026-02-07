/**
 * ModmailQuestionHandler - Handles multi-modal form wizard for modmail creation
 *
 * Manages the question flow for modmail categories with custom forms:
 * - Routes questions to select menus or modals based on field type
 * - Batches up to 5 text fields per modal (Discord limit)
 * - Shows review panel before final submission
 * - Handles field editing after review
 */

import type { Client, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction, MessageComponentInteraction, Interaction } from "discord.js";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonStyle } from "discord.js";
import { nanoid } from "nanoid";
import type { LibAPI } from "../../lib/index.js";
import { HeimdallButtonBuilder } from "../../lib/utils/components/HeimdallButtonBuilder.js";
import { createCloseTicketRow } from "./modmailButtons.js";
import { HeimdallStringSelectMenuBuilder } from "../../lib/utils/components/HeimdallStringSelectMenuBuilder.js";
import ModmailConfig, { ModmailFormFieldType, type FormField } from "../models/ModmailConfig.js";
import type { ModmailSessionService, ModmailSession } from "../services/ModmailSessionService.js";
import type { ModmailCreationService, ModmailCreationResult } from "../services/ModmailCreationService.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import { ModmailEmbeds } from "./ModmailEmbeds.js";

/**
 * ModmailQuestionHandler - Multi-modal form wizard for modmail creation
 */
export class ModmailQuestionHandler {
  private readonly BUTTON_TTL = 900; // 15 minutes
  private readonly SELECT_HANDLER_ID = "modmail.question.select";

  constructor(
    private client: Client,
    private sessionService: ModmailSessionService,
    private creationService: ModmailCreationService,
    private lib: LibAPI,
    private logger: PluginLogger,
  ) {
    // Register persistent handler for select menu answers
    this.registerSelectHandler();
  }

  /**
   * Register the persistent handler for select menu questions
   */
  private registerSelectHandler(): void {
    this.lib.componentCallbackService.registerPersistentHandler(this.SELECT_HANDLER_ID, async (interaction: Interaction) => {
      if (!interaction.isStringSelectMenu()) return;

      try {
        await this.handleSelectAnswer(interaction);
      } catch (error) {
        this.logger.error("Error handling select answer:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [ModmailEmbeds.error("Error", "Failed to process your selection. Please try again.")],
            ephemeral: true,
          });
        }
      }
    });
  }

  /**
   * Check if the next step in the question flow requires showing a modal.
   * Used to decide whether to defer an interaction before calling processNextStep —
   * you CANNOT show a modal on an already-deferred interaction.
   */
  private async nextStepNeedsModal(sessionId: string): Promise<boolean> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session) return false;

    const config = await ModmailConfig.findOne({ guildId: session.guildId });
    if (!config) return false;

    const category = config.categories?.find((cat) => cat.id === session.categoryId);
    if (!category) return false;

    const fields = category.formFields || [];
    const currentIndex = session.currentStep;

    // Review panel or end-of-form → no modal
    if (currentIndex >= fields.length) return false;

    const currentField = fields[currentIndex]!;
    // SELECT fields use a select menu message, not a modal
    return currentField.type !== ModmailFormFieldType.SELECT;
  }

  /**
   * Reply or edit reply depending on whether the interaction is already acknowledged.
   * Prevents "Interaction has already been acknowledged" errors.
   */
  private async safeReply(interaction: MessageComponentInteraction | ModalSubmitInteraction, data: { embeds: any[]; components?: any[]; ephemeral?: boolean }): Promise<void> {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(data);
    } else {
      await interaction.reply({ ...data, ephemeral: data.ephemeral ?? true });
    }
  }

  /**
   * Process the next step in the question flow
   * Routes to select menu or modal based on field type
   */
  async processNextStep(interaction: MessageComponentInteraction | ModalSubmitInteraction, sessionId: string): Promise<void> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      await this.safeReply(interaction, {
        embeds: [ModmailEmbeds.sessionExpired()],
      });
      return;
    }

    // Get category config for form fields
    const config = await ModmailConfig.findOne({ guildId: session.guildId });
    if (!config) {
      await this.safeReply(interaction, {
        embeds: [ModmailEmbeds.notConfigured()],
      });
      return;
    }

    const category = config.categories?.find((cat) => cat.id === session.categoryId);
    if (!category) {
      await this.safeReply(interaction, {
        embeds: [ModmailEmbeds.error("Category Not Found", "The selected category no longer exists.")],
      });
      return;
    }

    const fields = category.formFields || [];
    const currentIndex = session.currentStep;

    // If we've completed all fields, show review panel
    if (currentIndex >= fields.length) {
      await this.showReviewPanel(interaction, session, fields);
      return;
    }

    // Get current field
    const currentField = fields[currentIndex]!;

    // Route based on field type
    if (currentField.type === ModmailFormFieldType.SELECT) {
      await this.askSelectQuestion(interaction, session, currentField);
    } else {
      // Batch consecutive text fields into one modal (max 5)
      const textBatch = this.getBatchFromIndex(fields, currentIndex);
      await this.askModalQuestions(interaction, session, textBatch);
    }
  }

  /**
   * Get a batch of consecutive text fields starting from index (max 5)
   */
  private getBatchFromIndex(fields: FormField[], startIndex: number): FormField[] {
    const batch: FormField[] = [];
    let index = startIndex;

    while (index < fields.length && batch.length < 5) {
      const field = fields[index]!;

      // Stop at SELECT fields - they need their own interaction
      if (field.type === ModmailFormFieldType.SELECT) {
        break;
      }

      batch.push(field);
      index++;
    }

    return batch;
  }

  /**
   * Show a select menu question
   */
  private async askSelectQuestion(interaction: MessageComponentInteraction | ModalSubmitInteraction, session: ModmailSession, field: FormField): Promise<void> {
    // Build select menu with persistent handler
    const selectMenu = this.lib.createStringSelectMenuBuilderPersistent(this.SELECT_HANDLER_ID, {
      sessionId: session.sessionId,
      fieldId: field.id,
    });

    selectMenu.setPlaceholder(field.placeholder || `Select ${field.label}`);

    // Add options from field config (deduplicate by value as safety net)
    const seen = new Set<string>();
    const options = (field.options || [])
      .map((opt) => ({
        label: opt.label,
        value: opt.value,
      }))
      .filter((opt) => {
        if (seen.has(opt.value)) return false;
        seen.add(opt.value);
        return true;
      });

    selectMenu.addOptions(options);
    await selectMenu.ready();

    const row = new ActionRowBuilder<HeimdallStringSelectMenuBuilder>().addComponents(selectMenu);

    const embed = ModmailEmbeds.formQuestion(session.currentStep + 1, await this.getFieldCount(session), field.label, field.placeholder);

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } else {
      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true,
      });
    }
  }

  /**
   * Handle select menu answer submission
   */
  private async handleSelectAnswer(interaction: StringSelectMenuInteraction): Promise<void> {
    // Get metadata from the persistent component
    const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    if (!metadata) {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("Invalid Selection", "This selection is no longer valid.")],
        ephemeral: true,
      });
      return;
    }

    const { sessionId, fieldId } = metadata as { sessionId: string; fieldId: string };
    const selectedValue = interaction.values[0];

    if (!selectedValue) {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("No Selection", "Please select an option.")],
        ephemeral: true,
      });
      return;
    }

    // Record the answer
    await this.sessionService.recordAnswer(sessionId, fieldId, selectedValue);

    // Advance to next step
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      await interaction.reply({
        embeds: [ModmailEmbeds.sessionExpired()],
        ephemeral: true,
      });
      return;
    }

    await this.sessionService.updateSession(sessionId, {
      currentStep: session.currentStep + 1,
    });

    // Check if next step needs a modal — if so, we CANNOT defer first
    // (Discord rejects showModal on already-acknowledged interactions)
    const needsModal = await this.nextStepNeedsModal(sessionId);
    if (!needsModal) {
      await interaction.deferUpdate();
    }
    await this.processNextStep(interaction, sessionId);
  }

  /**
   * Build a modal from form fields (reusable helper)
   */
  private buildFormModal(fields: FormField[]): ModalBuilder {
    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Additional Information");

    for (const field of fields) {
      const textInput = new TextInputBuilder()
        .setCustomId(field.id)
        .setLabel(field.label.substring(0, 45)) // Discord limit
        .setRequired(field.required)
        .setStyle(field.type === ModmailFormFieldType.PARAGRAPH ? TextInputStyle.Paragraph : TextInputStyle.Short);

      if (field.placeholder) {
        textInput.setPlaceholder(field.placeholder.substring(0, 100));
      }

      if (field.minLength !== undefined) {
        textInput.setMinLength(field.minLength);
      }

      if (field.maxLength !== undefined) {
        textInput.setMaxLength(field.maxLength);
      }

      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
      modal.addComponents(row);
    }

    return modal;
  }

  /**
   * Show modal with batched text questions (up to 5)
   *
   * If the interaction is a ModalSubmitInteraction (chained modals), we can't call
   * showModal() directly — Discord forbids modal→modal chaining. Instead we show
   * a "Continue" button that gives us a fresh MessageComponentInteraction.
   */
  private async askModalQuestions(interaction: MessageComponentInteraction | ModalSubmitInteraction, session: ModmailSession, fields: FormField[]): Promise<void> {
    // Discord does not allow showing a modal on a deferred / already-replied interaction.
    // This covers two cases:
    //   1. Modal→modal chaining (ModalSubmitInteraction)
    //   2. Button/select callbacks that deferred before calling processNextStep
    // In either case we need a fresh interaction, so show a "Continue" button.
    if (interaction.deferred || interaction.replied) {
      await this.showContinueButton(interaction, session, fields);
      return;
    }

    // Normal path: interaction has not been acknowledged — show modal directly
    // At this point, ModalSubmitInteraction is excluded (deferred/replied guard above returns early)
    const componentInteraction = interaction as MessageComponentInteraction;
    const modal = this.buildFormModal(fields);

    await componentInteraction.showModal(modal);

    try {
      const submission = await componentInteraction.awaitModalSubmit({
        filter: (i: ModalSubmitInteraction) => i.customId === modal.data.custom_id && i.user.id === interaction.user.id,
        time: 900_000, // 15 minutes
      });

      await this.handleModalBatchSubmit(submission, session.sessionId, fields);
    } catch {
      // Modal timed out - session will expire naturally
      this.logger.debug(`Modal timed out for session ${session.sessionId}`);
    }
  }

  /**
   * Show a "Continue" button that opens the next modal.
   * Required when chaining modals (modal→modal), since Discord forbids
   * calling showModal() on a ModalSubmitInteraction.
   */
  private async showContinueButton(interaction: MessageComponentInteraction | ModalSubmitInteraction, session: ModmailSession, fields: FormField[]): Promise<void> {
    const totalFields = await this.getFieldCount(session);
    const embed = ModmailEmbeds.formQuestion(session.currentStep + 1, totalFields, fields[0]!.label, "Click Continue to answer the next set of questions.");

    const continueBtn = this.lib.createButtonBuilder(async (btnInteraction: ButtonInteraction) => {
      // Now we have a fresh MessageComponentInteraction — safe to show modal
      const modal = this.buildFormModal(fields);
      await btnInteraction.showModal(modal);

      try {
        const submission = await btnInteraction.awaitModalSubmit({
          filter: (i) => i.customId === modal.data.custom_id && i.user.id === btnInteraction.user.id,
          time: 900_000,
        });

        await this.handleModalBatchSubmit(submission, session.sessionId, fields);
      } catch {
        this.logger.debug(`Modal timed out for session ${session.sessionId}`);
      }
    }, this.BUTTON_TTL);

    continueBtn.setLabel("Continue").setStyle(ButtonStyle.Primary).setEmoji("📝");
    await continueBtn.ready();

    const row = new ActionRowBuilder<HeimdallButtonBuilder>().addComponents(continueBtn);

    await this.safeReply(interaction, {
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle modal batch submission
   */
  private async handleModalBatchSubmit(interaction: ModalSubmitInteraction, sessionId: string, fields: FormField[]): Promise<void> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      await interaction.reply({
        embeds: [ModmailEmbeds.sessionExpired()],
        ephemeral: true,
      });
      return;
    }

    // Record all answers from the modal
    for (const field of fields) {
      const value = interaction.fields.getTextInputValue(field.id);
      await this.sessionService.recordAnswer(sessionId, field.id, value);
    }

    // Advance step by the number of fields we processed
    await this.sessionService.updateSession(sessionId, {
      currentStep: session.currentStep + fields.length,
    });

    // Defer the modal submission before proceeding.
    // processNextStep will handle the modal-chaining case via showContinueButton.
    await interaction.deferUpdate();

    // Process next step
    await this.processNextStep(interaction, sessionId);
  }

  /**
   * Show review panel with all answers and submit/edit buttons
   */
  async showReviewPanel(interaction: MessageComponentInteraction | ModalSubmitInteraction, session: ModmailSession, fields: FormField[]): Promise<void> {
    // Build answer list for display
    const answers = fields.map((field) => ({
      label: field.label,
      value: session.answers[field.id] || "(not answered)",
    }));

    // Get guild name
    const guild = await this.lib.thingGetter.getGuild(session.guildId);
    const guildName = guild?.name || "Unknown Server";

    // Get category name
    const config = await ModmailConfig.findOne({ guildId: session.guildId });
    const category = config?.categories?.find((cat) => cat.id === session.categoryId);
    const categoryName = category?.name || "General";

    const embed = ModmailEmbeds.reviewPanel(guildName, categoryName, session.initialMessage, answers);

    // Create submit button
    const submitButton = this.lib.createButtonBuilder(async (btnInteraction: ButtonInteraction) => {
      await this.handleFinalSubmit(btnInteraction, session.sessionId);
    }, this.BUTTON_TTL);
    submitButton.setLabel("Submit").setStyle(ButtonStyle.Success).setEmoji("✅");
    await submitButton.ready();

    // Create edit button
    const editButton = this.lib.createButtonBuilder(async (btnInteraction: ButtonInteraction) => {
      await this.handleEdit(btnInteraction, session.sessionId, fields);
    }, this.BUTTON_TTL);
    editButton.setLabel("Edit").setStyle(ButtonStyle.Secondary).setEmoji("✏️");
    await editButton.ready();

    // Create cancel button
    const cancelButton = this.lib.createButtonBuilder(async (btnInteraction: ButtonInteraction) => {
      await this.handleCancel(btnInteraction, session.sessionId);
    }, this.BUTTON_TTL);
    cancelButton.setLabel("Cancel").setStyle(ButtonStyle.Danger).setEmoji("❌");
    await cancelButton.ready();

    const row = new ActionRowBuilder<HeimdallButtonBuilder>().addComponents(submitButton, editButton, cancelButton);

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } else {
      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true,
      });
    }
  }

  /**
   * Handle final submission
   */
  private async handleFinalSubmit(interaction: ButtonInteraction, sessionId: string): Promise<void> {
    await interaction.deferUpdate();

    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.sessionExpired()],
        components: [],
      });
      return;
    }

    // Show loading state
    await interaction.editReply({
      embeds: [ModmailEmbeds.loading("Creating your modmail...")],
      components: [],
    });

    // Convert session answers to form responses
    const config = await ModmailConfig.findOne({ guildId: session.guildId });
    const category = config?.categories?.find((cat) => cat.id === session.categoryId);
    const formResponses = (category?.formFields || []).map((field) => ({
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.type as "short" | "paragraph" | "select" | "number",
      value: session.answers[field.id] || "",
    }));

    // Create the modmail
    const result: ModmailCreationResult = await this.creationService.createModmail({
      guildId: session.guildId,
      userId: session.userId,
      userDisplayName: session.userDisplayName,
      categoryId: session.categoryId,
      initialMessage: session.initialMessage,
      initialMessageRef: session.initialMessageRef,
      queuedMessageRefs: session.queuedMessageRefs,
      formResponses,
      createdVia: "dm",
    });

    // Delete session
    await this.sessionService.deleteSession(sessionId);

    if (result.success) {
      const guild = await this.lib.thingGetter.getGuild(session.guildId);

      // Create persistent close button for user
      const closeRow = await createCloseTicketRow(this.lib);

      await interaction.editReply({
        embeds: [ModmailEmbeds.threadCreated(guild?.name || "the server", category?.name || "General")],
        components: [closeRow],
      });
    } else {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Creation Failed", result.userMessage || "Failed to create modmail. Please try again.")],
        components: [],
      });
    }
  }

  /**
   * Handle edit request - show field picker
   */
  private async handleEdit(interaction: ButtonInteraction, sessionId: string, fields: FormField[]): Promise<void> {
    await interaction.deferUpdate();

    // Create select menu to pick which field to edit
    const fieldSelect = this.lib.createStringSelectMenuBuilder(async (selectInteraction: StringSelectMenuInteraction) => {
      const fieldId = selectInteraction.values[0];
      if (!fieldId) return;

      // Find field index
      const fieldIndex = fields.findIndex((f) => f.id === fieldId);
      if (fieldIndex === -1) {
        await selectInteraction.reply({
          embeds: [ModmailEmbeds.error("Field Not Found", "The selected field could not be found.")],
          ephemeral: true,
        });
        return;
      }

      // Reset session to that step
      await this.sessionService.updateSession(sessionId, {
        currentStep: fieldIndex,
      });

      // Don't defer if the target field needs a modal (can't showModal after defer)
      const field = fields[fieldIndex]!;
      if (field.type === ModmailFormFieldType.SELECT) {
        await selectInteraction.deferUpdate();
      }
      await this.processNextStep(selectInteraction, sessionId);
    }, this.BUTTON_TTL);

    fieldSelect.setPlaceholder("Select a field to edit");
    fieldSelect.addOptions(
      fields.map((field, index) => ({
        label: field.label.substring(0, 100),
        value: field.id,
        description: `Question ${index + 1}`,
      })),
    );
    await fieldSelect.ready();

    const row = new ActionRowBuilder<HeimdallStringSelectMenuBuilder>().addComponents(fieldSelect);

    await interaction.editReply({
      embeds: [ModmailEmbeds.info("Edit Response", "Select which field you would like to edit:")],
      components: [row],
    });
  }

  /**
   * Handle cancel request
   */
  private async handleCancel(interaction: ButtonInteraction, sessionId: string): Promise<void> {
    await interaction.deferUpdate();

    // Delete session
    await this.sessionService.deleteSession(sessionId);

    await interaction.editReply({
      embeds: [ModmailEmbeds.info("Cancelled", "Your modmail has been cancelled. You can start a new one anytime.")],
      components: [],
    });
  }

  /**
   * Get total field count for a session
   */
  private async getFieldCount(session: ModmailSession): Promise<number> {
    const config = await ModmailConfig.findOne({ guildId: session.guildId });
    const category = config?.categories?.find((cat) => cat.id === session.categoryId);
    return category?.formFields?.length || 0;
  }

  /**
   * Start the question flow for a session
   * Called after category selection if the category has form fields
   */
  async startQuestionFlow(interaction: MessageComponentInteraction, sessionId: string): Promise<void> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      await interaction.reply({
        embeds: [ModmailEmbeds.sessionExpired()],
        ephemeral: true,
      });
      return;
    }

    // Reset to step 0
    await this.sessionService.updateSession(sessionId, {
      currentStep: 0,
    });

    // Start processing
    await this.processNextStep(interaction, sessionId);
  }
}

export default ModmailQuestionHandler;
