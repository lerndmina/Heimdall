import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type BaseInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import { ApplicationService } from "./ApplicationService.js";
import { ApplicationSessionService, type ApplicationAnswer, type ApplicationQuestionType } from "./ApplicationSessionService.js";
import { ApplicationReviewService } from "./ApplicationReviewService.js";
import { formatApplicationMessage, formatApplicationMessageEmbed, hasApplicationMessageEmbedContent } from "../utils/messagePlaceholders.js";

type QuestionType = "short" | "long" | "select_single" | "select_multi" | "button" | "number";

interface ApplicationQuestion {
  id: string;
  type: QuestionType;
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  options?: Array<{ id: string; label: string; value: string; description?: string; emoji?: string }>;
}

const APPLICATION_TEXT_LIMIT = 2000;
const FINAL_REVIEW_SELECT_PAGE_SIZE = 25;
const FINAL_REVIEW_EMBED_DESCRIPTION_LIMIT = 3900;
const MAX_STAGE_EMBEDS = 10;
type ApplicationMessageMode = "text" | "embed" | "both";

function normalizeMessageMode(value: unknown): ApplicationMessageMode {
  return value === "text" || value === "embed" || value === "both" ? value : "embed";
}

function truncateWithIndicator(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return "…";
  return `${value.slice(0, maxLength - 1)}…`;
}

function formatCooldownDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
  return parts.join(", ") || "a moment";
}

export class ApplicationFlowService {
  constructor(
    private readonly client: HeimdallClient,
    private readonly lib: LibAPI,
    private readonly applicationService: ApplicationService,
    private readonly sessionService: ApplicationSessionService,
    private readonly reviewService: ApplicationReviewService,
    private readonly logger: PluginLogger,
  ) {}

  async startFromPanel(interaction: ButtonInteraction, formId: string): Promise<void> {
    if (!interaction.guild || !interaction.guildId) return;

    const form = await this.applicationService.getForm(interaction.guildId, formId);
    if (!form || !form.enabled) {
      await interaction.reply({ content: "❌ This application form is unavailable.", ephemeral: true });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "❌ Could not resolve your member record.", ephemeral: true });
      return;
    }

    if ((form.questions || []).length === 0) {
      await interaction.reply({ content: "❌ This form has no questions configured.", ephemeral: true });
      return;
    }

    if (Array.isArray(form.requiredRoleIds) && form.requiredRoleIds.length > 0) {
      const hasAllRequired = form.requiredRoleIds.every((roleId) => member.roles.cache.has(roleId));
      if (!hasAllRequired) {
        await interaction.reply({ content: "❌ You do not have all required roles to apply for this form.", ephemeral: true });
        return;
      }
    }

    if (Array.isArray(form.restrictedRoleIds) && form.restrictedRoleIds.length > 0) {
      const hasRestricted = form.restrictedRoleIds.some((roleId) => member.roles.cache.has(roleId));
      if (hasRestricted) {
        await interaction.reply({ content: "❌ You cannot apply for this form with your current roles.", ephemeral: true });
        return;
      }
    }

    const latest = await this.applicationService.getLatestSubmissionForUser(interaction.guildId, form.formId, interaction.user.id);
    if (latest?.status === "pending") {
      await interaction.reply({ content: "❌ You already have a pending application for this form.", ephemeral: true });
      return;
    }

    const cooldownSeconds = Number(form.cooldownSeconds || 0);
    if (cooldownSeconds > 0 && latest?.status === "denied") {
      const reference = latest.reviewedAt ? new Date(latest.reviewedAt).getTime() : new Date(latest.createdAt || Date.now()).getTime();
      const remaining = reference + cooldownSeconds * 1000 - Date.now();
      if (remaining > 0) {
        await interaction.reply({ content: `❌ You must wait about **${formatCooldownDuration(remaining)}** before re-applying.`, ephemeral: true });
        return;
      }
    }

    const existingSession = await this.sessionService.getSessionForUser(interaction.guildId, form.formId, interaction.user.id);
    const session =
      existingSession ||
      (await this.sessionService.createSession({
        guildId: interaction.guildId,
        formId: form.formId,
        userId: interaction.user.id,
        userDisplayName: member.displayName || interaction.user.globalName || interaction.user.username,
        userAvatarUrl: interaction.user.displayAvatarURL(),
      }));

    if (!existingSession) {
      await interaction.reply({ content: `📝 Starting **${form.name}** application.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `📝 Resuming your in-progress **${form.name}** application.`, ephemeral: true });
    }

    await this.renderCurrentStep(interaction, form, session.sessionId);
  }

  async renderCurrentStep(interaction: BaseInteraction | MessageComponentInteraction | ModalSubmitInteraction, form: any, sessionId: string): Promise<void> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      await this.replyEphemeral(interaction, "❌ Your session expired. Please click Apply again.");
      return;
    }

    const questions = (form.questions || []) as ApplicationQuestion[];
    const current = questions[session.currentIndex];

    if (!current) {
      await this.renderFinalReview(interaction, form, sessionId);
      return;
    }

    if (current.type === "short" || current.type === "long" || current.type === "number") {
      await this.renderTextQuestion(interaction, form, sessionId, current);
      return;
    }

    if (current.type === "select_single" || current.type === "select_multi") {
      await this.renderSelectQuestion(interaction, form, sessionId, current);
      return;
    }

    await this.renderButtonQuestion(interaction, form, sessionId, current);
  }

  private async renderTextQuestion(interaction: BaseInteraction | MessageComponentInteraction | ModalSubmitInteraction, form: any, sessionId: string, question: ApplicationQuestion): Promise<void> {
    const openModalButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      const modal = new ModalBuilder().setCustomId(`application.answer.${sessionId}.${question.id}`).setTitle(truncateWithIndicator(form.name, 45));
      const input = new TextInputBuilder()
        .setCustomId("answer")
        .setLabel(truncateWithIndicator(question.label, 45))
        .setStyle(question.type === "long" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(question.required !== false)
        .setPlaceholder(question.placeholder || "Type your answer");

      if (typeof question.minLength === "number") input.setMinLength(Math.min(APPLICATION_TEXT_LIMIT, Math.max(0, question.minLength)));
      if (typeof question.maxLength === "number") input.setMaxLength(Math.min(APPLICATION_TEXT_LIMIT, Math.max(1, question.maxLength)));
      if (question.type === "number") input.setPlaceholder("Enter a number");

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await buttonInteraction.showModal(modal);

      try {
        const submitted = await buttonInteraction.awaitModalSubmit({
          filter: (candidate) => candidate.user.id === buttonInteraction.user.id && candidate.customId === `application.answer.${sessionId}.${question.id}`,
          time: 900_000,
        });

        const rawAnswer = submitted.fields.getTextInputValue("answer").trim();
        if (question.type === "number") {
          const parsed = Number(rawAnswer);
          if (!Number.isFinite(parsed)) {
            await submitted.reply({ content: "❌ Please enter a valid number.", ephemeral: true });
            return;
          }
          if (typeof question.minValue === "number" && parsed < question.minValue) {
            await submitted.reply({ content: `❌ Value must be at least ${question.minValue}.`, ephemeral: true });
            return;
          }
          if (typeof question.maxValue === "number" && parsed > question.maxValue) {
            await submitted.reply({ content: `❌ Value must be at most ${question.maxValue}.`, ephemeral: true });
            return;
          }
        }

        await this.renderAnswerConfirmation(submitted, form, sessionId, {
          questionId: question.id,
          questionLabel: question.label,
          questionType: question.type,
          value: rawAnswer,
        });
      } catch {
        // modal timed out or dismissed
      }
    }, 900);

    openModalButton.setLabel("Answer").setEmoji("📝").setStyle(ButtonStyle.Primary);
    await openModalButton.ready();

    const cancelButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      await this.renderCancelConfirmation(buttonInteraction, sessionId, async (backInteraction) => {
        await this.renderCurrentStep(backInteraction, form, sessionId);
      });
    }, 900);
    cancelButton.setLabel("Cancel").setEmoji("❌").setStyle(ButtonStyle.Secondary);
    await cancelButton.ready();

    await this.sendStageMessage(interaction, {
      title: `${form.name} — Question`,
      description: `**${question.label}**\n${question.description || ""}`,
      footer: `Question type: ${question.type}`,
      components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(openModalButton as any, cancelButton as any)],
    });
  }

  private async renderSelectQuestion(interaction: BaseInteraction | MessageComponentInteraction | ModalSubmitInteraction, form: any, sessionId: string, question: ApplicationQuestion): Promise<void> {
    const options = (question.options || []).slice(0, 25);
    if (options.length === 0) {
      await this.replyEphemeral(interaction, `❌ Question \"${question.label}\" has no options configured.`);
      return;
    }

    const selectMenu = this.lib.createStringSelectMenuBuilder(async (selectInteraction) => {
      const selectedValues = [...selectInteraction.values];
      const selectedLabels = selectedValues.map((value) => options.find((entry) => entry.value === value)?.label).filter((entry): entry is string => !!entry);

      await this.renderAnswerConfirmation(selectInteraction, form, sessionId, {
        questionId: question.id,
        questionLabel: question.label,
        questionType: question.type,
        value: question.type === "select_single" ? selectedLabels[0] || selectedValues[0] : undefined,
        values: question.type === "select_multi" ? (selectedLabels.length > 0 ? selectedLabels : selectedValues) : undefined,
      });
    }, 900);

    selectMenu
      .setPlaceholder(question.placeholder || "Select an option")
      .setMinValues(question.required === false ? 0 : 1)
      .setMaxValues(question.type === "select_multi" ? Math.min(options.length, 25) : 1)
      .addOptions(
        options.map((entry) => ({
          label: entry.label,
          value: entry.value,
          description: entry.description,
          emoji: entry.emoji,
        })),
      );

    await selectMenu.ready();

    const cancelButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      await this.renderCancelConfirmation(buttonInteraction, sessionId, async (backInteraction) => {
        await this.renderCurrentStep(backInteraction, form, sessionId);
      });
    }, 900);
    cancelButton.setLabel("Cancel").setEmoji("❌").setStyle(ButtonStyle.Secondary);
    await cancelButton.ready();

    await this.sendStageMessage(interaction, {
      title: `${form.name} — Question`,
      description: `**${question.label}**\n${question.description || ""}`,
      footer: `Question type: ${question.type}`,
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(selectMenu as any),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(cancelButton as any),
      ],
    });
  }

  private async renderButtonQuestion(interaction: BaseInteraction | MessageComponentInteraction | ModalSubmitInteraction, form: any, sessionId: string, question: ApplicationQuestion): Promise<void> {
    const options = (question.options || []).slice(0, 25);
    if (options.length === 0) {
      await this.replyEphemeral(interaction, `❌ Question \"${question.label}\" has no button options configured.`);
      return;
    }

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
    for (let rowStart = 0; rowStart < options.length; rowStart += 5) {
      const rowOptions = options.slice(rowStart, rowStart + 5);
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

      for (const option of rowOptions) {
        const optionButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
          await this.renderAnswerConfirmation(buttonInteraction, form, sessionId, {
            questionId: question.id,
            questionLabel: question.label,
            questionType: question.type,
            value: option.label,
          });
        }, 900);

        optionButton.setLabel(option.label.slice(0, 80)).setStyle(ButtonStyle.Secondary);
        if (option.emoji) optionButton.setEmoji(option.emoji);
        await optionButton.ready();
        row.addComponents(optionButton as any);
      }

      rows.push(row);
    }

    const cancelButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      await this.renderCancelConfirmation(buttonInteraction, sessionId, async (backInteraction) => {
        await this.renderCurrentStep(backInteraction, form, sessionId);
      });
    }, 900);
    cancelButton.setLabel("Cancel").setEmoji("❌").setStyle(ButtonStyle.Secondary);
    await cancelButton.ready();

    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(cancelButton as any));

    await this.sendStageMessage(interaction, {
      title: `${form.name} — Question`,
      description: `**${question.label}**\n${question.description || ""}`,
      footer: `Question type: ${question.type}`,
      components: rows,
    });
  }

  private async renderAnswerConfirmation(interaction: MessageComponentInteraction | ModalSubmitInteraction, form: any, sessionId: string, draftAnswer: ApplicationAnswer): Promise<void> {
    const normalizedAnswer: ApplicationAnswer = {
      ...draftAnswer,
      value: draftAnswer.value ? draftAnswer.value.slice(0, APPLICATION_TEXT_LIMIT) : draftAnswer.value,
      values: Array.isArray(draftAnswer.values) ? draftAnswer.values.map((entry) => entry.slice(0, APPLICATION_TEXT_LIMIT)) : draftAnswer.values,
    };

    const confirmButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        await buttonInteraction.reply({ content: "❌ Session expired.", ephemeral: true });
        return;
      }

      await this.sessionService.setAnswer(sessionId, normalizedAnswer);
      await this.sessionService.setCurrentIndex(sessionId, session.currentIndex + 1);
      const latestForm = await this.applicationService.getForm(session.guildId, session.formId);
      if (!latestForm) {
        await buttonInteraction.reply({ content: "❌ Form no longer exists.", ephemeral: true });
        return;
      }
      await this.renderCurrentStep(buttonInteraction, latestForm, sessionId);
    }, 900);

    confirmButton.setLabel("Confirm").setEmoji("✅").setStyle(ButtonStyle.Success);
    await confirmButton.ready();

    const editButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        await buttonInteraction.reply({ content: "❌ Session expired.", ephemeral: true });
        return;
      }

      const latestForm = await this.applicationService.getForm(session.guildId, session.formId);
      if (!latestForm) {
        await buttonInteraction.reply({ content: "❌ Form no longer exists.", ephemeral: true });
        return;
      }
      await this.renderCurrentStep(buttonInteraction, latestForm, sessionId);
    }, 900);

    editButton.setLabel("Edit").setEmoji("✏️").setStyle(ButtonStyle.Secondary);
    await editButton.ready();

    const valuePreview = Array.isArray(normalizedAnswer.values) ? normalizedAnswer.values.map((entry) => `• ${entry}`).join("\n") : normalizedAnswer.value || "_No answer_";

    await this.sendStageMessage(interaction, {
      title: `${form.name} — Confirm Answer`,
      description: `**${normalizedAnswer.questionLabel}**\n\n${valuePreview}`,
      footer: "Confirm this answer or edit it",
      components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(confirmButton as any, editButton as any)],
    });
  }

  private async renderFinalReview(interaction: BaseInteraction | MessageComponentInteraction | ModalSubmitInteraction, form: any, sessionId: string, page = 0): Promise<void> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      await this.replyEphemeral(interaction, "❌ Session expired.");
      return;
    }

    const questions = (form.questions || []) as ApplicationQuestion[];
    const totalPages = Math.max(1, Math.ceil(questions.length / FINAL_REVIEW_SELECT_PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const selectStart = safePage * FINAL_REVIEW_SELECT_PAGE_SIZE;
    const selectEnd = selectStart + FINAL_REVIEW_SELECT_PAGE_SIZE;

    const lines = questions.map((question, index) => {
      const answer = session.answers[question.id];
      if (!answer) return `**${index + 1}. ${question.label}**\n_No answer_`;
      if (Array.isArray(answer.values) && answer.values.length > 0) return `**${index + 1}. ${question.label}**\n${answer.values.map((entry) => `• ${entry}`).join("\n")}`;
      return `**${index + 1}. ${question.label}**\n${answer.value || "_No answer_"}`;
    });

    const embedDescriptions: string[] = [];
    let currentDescription = "";
    for (const line of lines) {
      const candidate = currentDescription.length === 0 ? line : `${currentDescription}\n\n${line}`;
      if (candidate.length <= FINAL_REVIEW_EMBED_DESCRIPTION_LIMIT) {
        currentDescription = candidate;
        continue;
      }

      if (currentDescription.length > 0) {
        embedDescriptions.push(currentDescription);
      }

      if (line.length <= FINAL_REVIEW_EMBED_DESCRIPTION_LIMIT) {
        currentDescription = line;
      } else {
        embedDescriptions.push(line.slice(0, FINAL_REVIEW_EMBED_DESCRIPTION_LIMIT - 1) + "…");
        currentDescription = "";
      }
    }
    if (currentDescription.length > 0) {
      embedDescriptions.push(currentDescription);
    }

    const limitedDescriptions = embedDescriptions.slice(0, MAX_STAGE_EMBEDS);
    if (limitedDescriptions.length === 0) {
      limitedDescriptions.push("No questions are currently configured for this form.");
    }
    if (embedDescriptions.length > MAX_STAGE_EMBEDS && limitedDescriptions.length > 0) {
      const lastIndex = limitedDescriptions.length - 1;
      const lastDescription = limitedDescriptions[lastIndex];
      if (!lastDescription) {
        // no-op guard for strict indexed access
      } else {
        const overflowNotice = `\n\n_Only the first ${MAX_STAGE_EMBEDS} review embeds are shown in Discord._`;
        const available = FINAL_REVIEW_EMBED_DESCRIPTION_LIMIT - lastDescription.length;
        if (available > overflowNotice.length) {
          limitedDescriptions[lastIndex] += overflowNotice;
        }
      }
    }

    const reviewEmbeds = limitedDescriptions.map((description, embedIndex) => {
      const titleBase = `${form.name} — Final Review`;
      const title = limitedDescriptions.length > 1 ? `${titleBase} (${embedIndex + 1}/${limitedDescriptions.length})` : titleBase;
      return this.lib
        .createEmbedBuilder()
        .setTitle(truncateWithIndicator(title, 256))
        .setDescription(description)
        .setColor("Blurple")
        .setFooter({ text: `Review your answers, then submit • Selector page ${safePage + 1}/${totalPages}` });
    });

    const submitButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      const latestSession = await this.sessionService.getSession(sessionId);
      if (!latestSession) {
        await buttonInteraction.reply({ content: "❌ Session expired.", ephemeral: true });
        return;
      }

      const latestForm = await this.applicationService.getForm(latestSession.guildId, latestSession.formId);
      if (!latestForm) {
        await buttonInteraction.reply({ content: "❌ Form no longer exists.", ephemeral: true });
        return;
      }

      const result = await this.reviewService.submitFromSession(latestForm, latestSession);
      if (!result.success) {
        await buttonInteraction.reply({ content: `❌ ${result.error || "Failed to submit application."}`, ephemeral: true });
        return;
      }

      await this.sessionService.deleteSession(sessionId);

      if (latestForm.completionMessage || hasApplicationMessageEmbedContent(latestForm.completionMessageEmbed)) {
        const user = await this.client.users.fetch(latestSession.userId).catch(() => null);
        if (user) {
          const messageMode = normalizeMessageMode(latestForm.completionMessageMode);
          const context = {
            userId: latestSession.userId,
            userDisplayName: latestSession.userDisplayName,
            formName: latestForm.name,
            applicationId: result.applicationId,
            applicationNumber: result.applicationNumber,
            guildId: latestSession.guildId,
          } as const;

          const content = latestForm.completionMessage ? formatApplicationMessage(latestForm.completionMessage, context).slice(0, APPLICATION_TEXT_LIMIT) : undefined;
          const embedTemplate = formatApplicationMessageEmbed(latestForm.completionMessageEmbed, context);
          const embed = hasApplicationMessageEmbedContent(embedTemplate) ? this.lib.createEmbedBuilder() : null;

          if (embed) {
            if (embedTemplate.title) embed.setTitle(embedTemplate.title);
            if (embedTemplate.description) embed.setDescription(embedTemplate.description);
            if (embedTemplate.color) {
              try {
                embed.setColor(embedTemplate.color as any);
              } catch {
                // ignore invalid colors to avoid blocking DMs
              }
            }
            if (embedTemplate.image) embed.setImage(embedTemplate.image);
            if (embedTemplate.thumbnail) embed.setThumbnail(embedTemplate.thumbnail);
            if (embedTemplate.footer) embed.setFooter({ text: embedTemplate.footer });
          }

          const payload: { content?: string; embeds?: any[] } = {};
          if ((messageMode === "text" || messageMode === "both") && content && content.trim().length > 0) payload.content = content;
          if ((messageMode === "embed" || messageMode === "both") && embed) payload.embeds = [embed];

          if (payload.content || payload.embeds) {
            await user.send(payload).catch(() => null);
          }
        }
      }

      await buttonInteraction.reply({
        content: `✅ Application submitted successfully! Your application ID is \`${result.applicationId}\`.`,
        ephemeral: true,
      });
    }, 900);
    submitButton.setLabel("Submit Application").setEmoji("✅").setStyle(ButtonStyle.Success);
    await submitButton.ready();

    const selectorRows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
    if (questions.length > 0) {
      const editButton = this.lib.createStringSelectMenuBuilder(async (selectInteraction) => {
        const selected = selectInteraction.values[0];
        const selectedIndex = Number(selected);
        if (!Number.isFinite(selectedIndex)) {
          await selectInteraction.reply({ content: "❌ Invalid question selection.", ephemeral: true });
          return;
        }

        const latestSession = await this.sessionService.setCurrentIndex(sessionId, selectedIndex);
        if (!latestSession) {
          await selectInteraction.reply({ content: "❌ Session expired.", ephemeral: true });
          return;
        }

        await this.renderCurrentStep(selectInteraction, form, sessionId);
      }, 900);

      editButton
        .setPlaceholder(`Select a question to edit (${safePage + 1}/${totalPages})`)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          questions.slice(selectStart, selectEnd).map((question, pageIndex) => ({
            label: truncateWithIndicator(question.label, 100),
            value: String(selectStart + pageIndex),
          })),
        );
      await editButton.ready();

      selectorRows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(editButton as any));
    }
    if (totalPages > 1) {
      const previousButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
        await this.renderFinalReview(buttonInteraction, form, sessionId, safePage - 1);
      }, 900);
      previousButton
        .setLabel("Previous")
        .setEmoji("◀️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0);
      await previousButton.ready();

      const nextButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
        await this.renderFinalReview(buttonInteraction, form, sessionId, safePage + 1);
      }, 900);
      nextButton
        .setLabel("Next")
        .setEmoji("▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1);
      await nextButton.ready();

      selectorRows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(previousButton as any, nextButton as any));
    }

    const cancelButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      await this.renderCancelConfirmation(buttonInteraction, sessionId, async (backInteraction) => {
        await this.renderFinalReview(backInteraction, form, sessionId, safePage);
      });
    }, 900);
    cancelButton.setLabel("Cancel").setEmoji("❌").setStyle(ButtonStyle.Secondary);
    await cancelButton.ready();

    await this.replyEphemeral(interaction, {
      embeds: reviewEmbeds,
      components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(submitButton as any, cancelButton as any), ...selectorRows],
    });
  }

  private async sendStageMessage(
    interaction: BaseInteraction | MessageComponentInteraction | ModalSubmitInteraction,
    payload: {
      title: string;
      description: string;
      footer?: string;
      components?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
    },
  ): Promise<void> {
    const embed = this.lib.createEmbedBuilder().setTitle(payload.title).setDescription(payload.description).setColor("Blurple");
    if (payload.footer) embed.setFooter({ text: payload.footer });

    await this.replyEphemeral(interaction, {
      embeds: [embed],
      components: payload.components || [],
    });
  }

  private async renderCancelConfirmation(interaction: MessageComponentInteraction, sessionId: string, onBack: (interaction: MessageComponentInteraction) => Promise<void>): Promise<void> {
    const confirmCancelButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      await this.sessionService.deleteSession(sessionId);
      await this.replyEphemeral(buttonInteraction, "✅ Application cancelled.");
    }, 900);
    confirmCancelButton.setLabel("Yes, cancel").setEmoji("🛑").setStyle(ButtonStyle.Danger);
    await confirmCancelButton.ready();

    const backButton = this.lib.createButtonBuilder(async (buttonInteraction) => {
      await onBack(buttonInteraction);
    }, 900);
    backButton.setLabel("Go Back").setEmoji("↩️").setStyle(ButtonStyle.Secondary);
    await backButton.ready();

    await this.replyEphemeral(interaction, {
      embeds: [this.lib.createEmbedBuilder().setTitle("Cancel Application?").setDescription("Are you sure you want to cancel your application? Your progress will be lost.").setColor("Orange")],
      components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(confirmCancelButton as any, backButton as any)],
    });
  }

  private async replyEphemeral(interaction: any, payload: string | { embeds?: any[]; components?: any[]; content?: string }): Promise<void> {
    const body = typeof payload === "string" ? { content: payload, ephemeral: true } : { ...payload, ephemeral: true };

    try {
      if (interaction.isMessageComponent?.()) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.update(body);
          return;
        }
        await interaction.editReply(body);
        return;
      }

      if (interaction.isModalSubmit?.()) {
        if (interaction.message && !interaction.deferred && !interaction.replied) {
          await interaction.update(body);
          return;
        }

        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply(body);
          return;
        }
        await interaction.editReply(body);
        return;
      }

      if (interaction.reply) {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(body);
        } else {
          await interaction.reply(body);
        }
      }
    } catch (error) {
      this.logger.debug("Failed to send stage message", error);
    }
  }
}
