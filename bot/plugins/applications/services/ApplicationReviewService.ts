import {
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type GuildMember,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { LibAPI } from "../../lib/index.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { ModmailPluginAPI } from "../../modmail/index.js";
import type { ApplicationSession } from "./ApplicationSessionService.js";
import { ApplicationService } from "./ApplicationService.js";
import { buildReviewComponents, buildSubmissionEmbeds } from "../utils/ApplicationEmbeds.js";
import { formatApplicationMessage, formatApplicationMessageEmbed, hasApplicationMessageEmbedContent } from "../utils/messagePlaceholders.js";

export class ApplicationReviewService {
  constructor(
    private readonly client: HeimdallClient,
    private readonly applicationService: ApplicationService,
    private readonly lib: LibAPI,
    private readonly logger: PluginLogger,
    private readonly modmailApi?: ModmailPluginAPI,
  ) {}

  async submitFromSession(form: any, session: ApplicationSession): Promise<{ success: boolean; applicationId?: string; error?: string }> {
    const answers = Object.values(session.answers);
    if (answers.length === 0) return { success: false, error: "No answers were provided" };
    if (!form.submissionChannelId) return { success: false, error: "Submission channel is not configured" };

    const submission = await this.applicationService.createSubmission({
      guildId: form.guildId,
      formId: form.formId,
      formName: form.name,
      userId: session.userId,
      userDisplayName: session.userDisplayName,
      userAvatarUrl: session.userAvatarUrl,
      responses: answers.map((entry) => ({
        questionId: entry.questionId,
        questionLabel: entry.questionLabel,
        questionType: entry.questionType,
        value: entry.value,
        values: entry.values,
      })),
      submissionChannelId: form.submissionChannelId,
    });

    const guild = await this.client.guilds.fetch(form.guildId);
    const targetChannel = await guild.channels.fetch(form.submissionChannelId);
    if (!targetChannel) return { success: false, error: "Submission channel no longer exists" };

    const dashboardUrl = process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/${form.guildId}/applications` : undefined;
    const components = await buildReviewComponents(this.lib, submission.applicationId, dashboardUrl, false);
    const embeds = buildSubmissionEmbeds(this.lib, submission as any);

    const roleMentions = Array.isArray(form.pingRoleIds) && form.pingRoleIds.length > 0 ? form.pingRoleIds.map((id: string) => `<@&${id}>`).join(" ") : "";

    if (form.submissionChannelType === "forum") {
      if (targetChannel.type !== ChannelType.GuildForum) return { success: false, error: "Configured submission channel is not a forum" };

      const thread = await targetChannel.threads.create({
        name: `Application #${submission.applicationNumber} — ${session.userDisplayName}`,
        message: {
          content: roleMentions || undefined,
          embeds,
          components: components as any,
        },
      });

      const starter = await thread.fetchStarterMessage();
      await this.applicationService.updateSubmissionMessageTarget(form.guildId, submission.applicationId, {
        submissionChannelId: thread.id,
        submissionMessageId: starter?.id,
        forumThreadId: thread.id,
      });
    } else {
      if (!targetChannel.isTextBased()) return { success: false, error: "Configured submission channel is not text-based" };
      const message = await targetChannel.send({
        content: roleMentions || undefined,
        embeds,
        components: components as any,
      } as any);

      await this.applicationService.updateSubmissionMessageTarget(form.guildId, submission.applicationId, {
        submissionChannelId: message.channelId,
        submissionMessageId: message.id,
      });
    }

    broadcastDashboardChange(form.guildId, "applications", "updated", { requiredAction: "applications.view" });
    return { success: true, applicationId: submission.applicationId };
  }

  async handleDecision(interaction: MessageComponentInteraction, applicationId: string, status: "approved" | "denied", reason?: string): Promise<void> {
    if (!interaction.guildId || !interaction.guild) return;

    const submission = await this.applicationService.getSubmission(interaction.guildId, applicationId);
    if (!submission) {
      await interaction.reply({ content: "❌ Application not found.", ephemeral: true });
      return;
    }

    if (submission.status !== "pending") {
      await interaction.reply({ content: "ℹ️ This application has already been reviewed.", ephemeral: true });
      return;
    }

    const form = await this.applicationService.getForm(interaction.guildId, submission.formId);
    if (!form) {
      await interaction.reply({ content: "❌ Associated form no longer exists.", ephemeral: true });
      return;
    }

    const actor = (interaction.member as GuildMember | null) ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (!actor) {
      await interaction.reply({ content: "❌ Could not resolve your member record.", ephemeral: true });
      return;
    }

    if (!this.canReview(actor, form.reviewRoleIds || [])) {
      await interaction.reply({ content: "❌ You do not have permission to review applications.", ephemeral: true });
      return;
    }

    const updated = await this.applicationService.updateSubmissionStatus({
      guildId: interaction.guildId,
      applicationId,
      status,
      reviewedBy: interaction.user.id,
      reviewReason: reason,
    });

    if (!updated) {
      await interaction.reply({ content: "❌ Failed to update application status.", ephemeral: true });
      return;
    }

    await this.applyDecisionRoles(interaction.guild, updated.userId, form, status);
    await this.tryNotifyApplicant(updated, form, status, reason);
    await this.updateSubmissionMessage(interaction.guildId, updated.applicationId);

    broadcastDashboardChange(interaction.guildId, "applications", "updated", { requiredAction: "applications.review" });

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: `✅ Application ${status}.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `✅ Application ${status}.`, ephemeral: true });
    }
  }

  async handleDecisionFromApi(guildId: string, applicationId: string, status: "approved" | "denied", reviewedBy: string, reason?: string): Promise<{ success: boolean; error?: string; data?: any }> {
    const submission = await this.applicationService.getSubmission(guildId, applicationId);
    if (!submission) return { success: false, error: "Application not found" };
    if (submission.status !== "pending") return { success: false, error: "Application has already been reviewed" };

    const form = await this.applicationService.getForm(guildId, submission.formId);
    if (!form) return { success: false, error: "Associated form not found" };

    const updated = await this.applicationService.updateSubmissionStatus({
      guildId,
      applicationId,
      status,
      reviewedBy,
      reviewReason: reason,
    });

    if (!updated) return { success: false, error: "Failed to update application status" };

    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      await this.applyDecisionRoles(guild, updated.userId, form, status);
    }
    await this.tryNotifyApplicant(updated, form, status, reason);
    await this.updateSubmissionMessage(guildId, applicationId);
    broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.review" });

    return { success: true, data: updated };
  }

  async handleDecisionWithModal(interaction: ButtonInteraction, applicationId: string, status: "approved" | "denied"): Promise<void> {
    const modal = new ModalBuilder().setCustomId(`application.review.reason.${applicationId}.${status}`).setTitle(status === "approved" ? "Approve with Reason" : "Deny with Reason");
    const input = new TextInputBuilder().setCustomId("reason").setLabel("Reason").setRequired(true).setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setPlaceholder("Enter review reason");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
  }

  async handleDecisionModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const parts = interaction.customId.split(".");
    const applicationId = parts[3];
    const rawStatus = parts[4];
    if (parts.length < 5 || !applicationId || (rawStatus !== "approved" && rawStatus !== "denied")) {
      await interaction.reply({ content: "❌ Invalid modal payload.", ephemeral: true });
      return;
    }

    const status = rawStatus;
    const reason = interaction.fields.getTextInputValue("reason");

    await interaction.deferReply({ ephemeral: true });
    await this.handleDecision(interaction as any, applicationId, status, reason);
  }

  async openLinkedModmail(interaction: MessageComponentInteraction, applicationId: string): Promise<void> {
    if (!interaction.guildId || !interaction.guild) return;

    const submission = await this.applicationService.getSubmission(interaction.guildId, applicationId);
    if (!submission) {
      await interaction.reply({ content: "❌ Application not found.", ephemeral: true });
      return;
    }

    if (!this.modmailApi) {
      await interaction.reply({ content: "❌ Modmail plugin is not loaded.", ephemeral: true });
      return;
    }

    if (submission.linkedModmailId) {
      await interaction.reply({ content: `ℹ️ Application already linked to modmail ${submission.linkedModmailId}.`, ephemeral: true });
      return;
    }

    const form = await this.applicationService.getForm(interaction.guildId, submission.formId);
    if (!form) {
      await interaction.reply({ content: "❌ Associated form no longer exists.", ephemeral: true });
      return;
    }

    const actor = (interaction.member as GuildMember | null) ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (!actor) {
      await interaction.reply({ content: "❌ Could not resolve your member record.", ephemeral: true });
      return;
    }

    if (!this.canReview(actor, form.reviewRoleIds || [])) {
      await interaction.reply({ content: "❌ You do not have permission to review applications.", ephemeral: true });
      return;
    }

    const result = await this.modmailApi.creationService.createModmail({
      guildId: interaction.guildId,
      userId: submission.userId,
      userDisplayName: submission.userDisplayName,
      initialMessage: `This modmail was opened from Application #${submission.applicationNumber} (${submission.formName}).`,
      categoryId: form.modmailCategoryId || undefined,
      formResponses: submission.responses.map((entry) => ({
        fieldId: entry.questionId,
        fieldLabel: entry.questionLabel,
        fieldType: entry.questionType === "long" ? "paragraph" : entry.questionType === "number" ? "number" : entry.questionType === "short" ? "short" : "select",
        value: entry.values && entry.values.length > 0 ? entry.values.join(", ") : entry.value || "",
      })) as any,
      createdVia: "api",
    });

    if (!result.success || !result.modmailId) {
      await interaction.reply({ content: `❌ Failed to open modmail: ${result.userMessage || result.error || "unknown error"}`, ephemeral: true });
      return;
    }

    await this.applicationService.setLinkedModmailId(interaction.guildId, applicationId, result.modmailId);
    await this.updateSubmissionMessage(interaction.guildId, applicationId);

    await interaction.reply({ content: `✅ Opened modmail ${result.modmailId}${result.channelId ? ` in <#${result.channelId}>` : ""}.`, ephemeral: true });
  }

  private canReview(member: GuildMember, reviewRoleIds: string[]): boolean {
    if (member.permissions.has("Administrator") || member.permissions.has("ManageMessages")) return true;
    if (!Array.isArray(reviewRoleIds) || reviewRoleIds.length === 0) return false;
    return reviewRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  private async applyDecisionRoles(guild: any, userId: string, form: any, status: "approved" | "denied"): Promise<void> {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return;

      if (status === "approved") {
        if (Array.isArray(form.acceptRoleIds) && form.acceptRoleIds.length > 0) await member.roles.add(form.acceptRoleIds, "Application approved").catch(() => null);
        if (Array.isArray(form.acceptRemoveRoleIds) && form.acceptRemoveRoleIds.length > 0) await member.roles.remove(form.acceptRemoveRoleIds, "Application approved").catch(() => null);
      } else {
        if (Array.isArray(form.denyRoleIds) && form.denyRoleIds.length > 0) await member.roles.add(form.denyRoleIds, "Application denied").catch(() => null);
        if (Array.isArray(form.denyRemoveRoleIds) && form.denyRemoveRoleIds.length > 0) await member.roles.remove(form.denyRemoveRoleIds, "Application denied").catch(() => null);
      }
    } catch (error) {
      this.logger.warn("Failed applying application decision roles", error);
    }
  }

  private async tryNotifyApplicant(submission: any, form: any, status: "approved" | "denied", reason?: string): Promise<void> {
    const text = status === "approved" ? form.acceptMessage : form.denyMessage;
    const embedTemplateRaw = status === "approved" ? form.acceptMessageEmbed : form.denyMessageEmbed;
    if ((!text || typeof text !== "string") && !hasApplicationMessageEmbedContent(embedTemplateRaw)) return;

    try {
      const user = await this.client.users.fetch(submission.userId);
      const context = {
        userId: submission.userId,
        userDisplayName: submission.userDisplayName,
        formName: submission.formName || form?.name,
        applicationId: submission.applicationId,
        applicationNumber: submission.applicationNumber,
        status,
        reason,
        reviewerId: submission.reviewedBy,
        guildId: submission.guildId,
      } as const;

      const content = text ? formatApplicationMessage(text, context) : undefined;
      const embedTemplate = formatApplicationMessageEmbed(embedTemplateRaw, context);
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
      if (content && content.trim().length > 0) payload.content = content;
      if (embed) payload.embeds = [embed];

      if (payload.content || payload.embeds) {
        await user.send(payload);
      }
    } catch (error) {
      this.logger.debug("Could not DM applicant", error);
    }
  }

  async updateSubmissionMessage(guildId: string, applicationId: string): Promise<void> {
    const submission = await this.applicationService.getSubmission(guildId, applicationId);
    if (!submission || !submission.submissionMessageId || !submission.submissionChannelId) return;

    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const channel = await guild.channels.fetch(submission.submissionChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(submission.submissionMessageId).catch(() => null);
    if (!message) return;

    const dashboardUrl = process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/${guildId}/applications` : undefined;
    const components = await buildReviewComponents(this.lib, submission.applicationId, dashboardUrl, submission.status !== "pending");
    const embeds = buildSubmissionEmbeds(this.lib, submission as any);

    await message.edit({ embeds, components: components as any }).catch(() => null);
  }
}
