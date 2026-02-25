import { nanoid } from "nanoid";
import { ActionRowBuilder, ButtonStyle, type ColorResolvable, type GuildTextBasedChannel, type MessageActionRowComponentBuilder } from "discord.js";
import ApplicationForm, { type IApplicationForm } from "../models/ApplicationForm.js";
import ApplicationSubmission, { type IApplicationSubmission } from "../models/ApplicationSubmission.js";
import type { LibAPI } from "../../lib/index.js";
import type { HeimdallClient } from "../../../src/types/Client.js";

type FormDoc = IApplicationForm & { _id: unknown; createdAt: Date; updatedAt: Date };
type SubmissionDoc = IApplicationSubmission & { _id: unknown; createdAt: Date; updatedAt: Date };

const DEFAULT_COMPLETION_MESSAGE = "Thanks {user_mention}, your application #{application_number} for {form_name} was submitted.";
const DEFAULT_ACCEPT_MESSAGE = "Your application #{application_number} for {form_name} was {status} by {reviewer_mention}.";
const DEFAULT_DENY_MESSAGE = "Your application #{application_number} for {form_name} was {status}. Reason: {reason}";
const DEFAULT_COMPLETION_MESSAGE_EMBED = { description: DEFAULT_COMPLETION_MESSAGE, color: "#5865f2" };
const DEFAULT_ACCEPT_MESSAGE_EMBED = { description: DEFAULT_ACCEPT_MESSAGE, color: "#57f287" };
const DEFAULT_DENY_MESSAGE_EMBED = { description: DEFAULT_DENY_MESSAGE, color: "#ed4245" };

export interface CreateFormInput {
  guildId: string;
  name: string;
  createdBy: string;
}

export interface UpdateSubmissionStatusInput {
  guildId: string;
  applicationId: string;
  status: "approved" | "denied";
  reviewedBy: string;
  reviewReason?: string;
}

export interface CreateSubmissionInput {
  guildId: string;
  formId: string;
  formName: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl?: string;
  responses: Array<{
    questionId: string;
    questionLabel: string;
    questionType: "short" | "long" | "select_single" | "select_multi" | "button" | "number";
    value?: string;
    values?: string[];
  }>;
  submissionChannelId?: string;
  submissionMessageId?: string;
  forumThreadId?: string;
}

export class ApplicationService {
  async createForm(input: CreateFormInput): Promise<FormDoc> {
    const existing = await ApplicationForm.findOne({ guildId: input.guildId, name: input.name.trim() });
    if (existing) throw new Error("Application form name already exists");

    const form = await ApplicationForm.create({
      formId: nanoid(),
      guildId: input.guildId,
      name: input.name.trim(),
      enabled: false,
      embed: {},
      questions: [],
      completionMessage: DEFAULT_COMPLETION_MESSAGE,
      acceptMessage: DEFAULT_ACCEPT_MESSAGE,
      denyMessage: DEFAULT_DENY_MESSAGE,
      completionMessageEmbed: DEFAULT_COMPLETION_MESSAGE_EMBED,
      acceptMessageEmbed: DEFAULT_ACCEPT_MESSAGE_EMBED,
      denyMessageEmbed: DEFAULT_DENY_MESSAGE_EMBED,
      createdBy: input.createdBy,
    });

    return form as unknown as FormDoc;
  }

  async listForms(guildId: string): Promise<FormDoc[]> {
    return (await ApplicationForm.find({ guildId }).sort({ createdAt: -1 })) as FormDoc[];
  }

  async getForm(guildId: string, formId: string): Promise<FormDoc | null> {
    return (await ApplicationForm.findOne({ guildId, formId })) as FormDoc | null;
  }

  async updateForm(guildId: string, formId: string, updates: Partial<IApplicationForm>): Promise<FormDoc | null> {
    const payload: Record<string, unknown> = {};

    if (updates.name !== undefined) payload.name = String(updates.name).trim();
    if (updates.enabled !== undefined) payload.enabled = !!updates.enabled;
    if (updates.embed !== undefined) payload.embed = updates.embed;
    if (updates.questions !== undefined) payload.questions = Array.isArray(updates.questions) ? updates.questions : [];
    if (updates.submissionChannelId !== undefined) payload.submissionChannelId = updates.submissionChannelId || null;
    if (updates.submissionChannelType !== undefined) payload.submissionChannelType = updates.submissionChannelType;
    if (updates.reviewRoleIds !== undefined) payload.reviewRoleIds = Array.isArray(updates.reviewRoleIds) ? updates.reviewRoleIds : [];
    if (updates.requiredRoleIds !== undefined) payload.requiredRoleIds = Array.isArray(updates.requiredRoleIds) ? updates.requiredRoleIds : [];
    if (updates.restrictedRoleIds !== undefined) payload.restrictedRoleIds = Array.isArray(updates.restrictedRoleIds) ? updates.restrictedRoleIds : [];
    if (updates.acceptRoleIds !== undefined) payload.acceptRoleIds = Array.isArray(updates.acceptRoleIds) ? updates.acceptRoleIds : [];
    if (updates.denyRoleIds !== undefined) payload.denyRoleIds = Array.isArray(updates.denyRoleIds) ? updates.denyRoleIds : [];
    if (updates.acceptRemoveRoleIds !== undefined) payload.acceptRemoveRoleIds = Array.isArray(updates.acceptRemoveRoleIds) ? updates.acceptRemoveRoleIds : [];
    if (updates.denyRemoveRoleIds !== undefined) payload.denyRemoveRoleIds = Array.isArray(updates.denyRemoveRoleIds) ? updates.denyRemoveRoleIds : [];
    if (updates.pingRoleIds !== undefined) payload.pingRoleIds = Array.isArray(updates.pingRoleIds) ? updates.pingRoleIds : [];
    if (updates.cooldownSeconds !== undefined) payload.cooldownSeconds = Number.isFinite(Number(updates.cooldownSeconds)) ? Number(updates.cooldownSeconds) : 0;
    if (updates.completionMessage !== undefined) payload.completionMessage = updates.completionMessage || null;
    if (updates.acceptMessage !== undefined) payload.acceptMessage = updates.acceptMessage || null;
    if (updates.denyMessage !== undefined) payload.denyMessage = updates.denyMessage || null;
    if (updates.completionMessageEmbed !== undefined) payload.completionMessageEmbed = updates.completionMessageEmbed || {};
    if (updates.acceptMessageEmbed !== undefined) payload.acceptMessageEmbed = updates.acceptMessageEmbed || {};
    if (updates.denyMessageEmbed !== undefined) payload.denyMessageEmbed = updates.denyMessageEmbed || {};
    if (updates.modmailCategoryId !== undefined) payload.modmailCategoryId = updates.modmailCategoryId || null;

    return (await ApplicationForm.findOneAndUpdate({ guildId, formId }, { $set: payload }, { new: true, runValidators: true })) as FormDoc | null;
  }

  async deleteForm(guildId: string, formId: string): Promise<FormDoc | null> {
    return (await ApplicationForm.findOneAndDelete({ guildId, formId })) as FormDoc | null;
  }

  async buildPanelMessage(form: FormDoc, lib: LibAPI): Promise<{ embeds: any[]; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] }> {
    const embed = lib.createEmbedBuilder();

    if (form.embed?.title) embed.setTitle(form.embed.title);
    if (form.embed?.description) embed.setDescription(form.embed.description);
    if (form.embed?.color) embed.setColor(form.embed.color as ColorResolvable);
    if (form.embed?.image) embed.setImage(form.embed.image);
    if (form.embed?.thumbnail) embed.setThumbnail(form.embed.thumbnail);
    if (form.embed?.footer) embed.setFooter({ text: form.embed.footer });
    if (form.embed?.fields?.length) {
      embed.addFields(
        form.embed.fields.map((field) => ({
          name: field.name,
          value: field.value,
          inline: !!field.inline,
        })),
      );
    }

    const applyButton = lib.createButtonBuilderPersistent("applications.apply", {
      formId: form.formId,
    });

    applyButton.setLabel("Apply").setStyle(ButtonStyle.Primary).setEmoji("📝");
    await applyButton.ready();

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(applyButton as MessageActionRowComponentBuilder);
    const embeds = form.embed && Object.keys(form.embed).length > 0 ? [embed] : [];
    return { embeds, components: [row] };
  }

  async postPanel(form: FormDoc, channel: GuildTextBasedChannel, userId: string, lib: LibAPI): Promise<FormDoc> {
    if (!channel.isTextBased()) throw new Error("Target channel is not text-based");
    const payload = await this.buildPanelMessage(form, lib);
    const message = await channel.send(payload as any);

    form.panels.push({
      panelId: nanoid(),
      channelId: message.channelId,
      messageId: message.id,
      postedAt: new Date(),
      postedBy: userId,
    } as any);

    await (form as any).save();
    return form;
  }

  async updatePostedPanels(form: FormDoc, client: HeimdallClient, lib: LibAPI): Promise<{ updated: number; removed: number }> {
    const payload = await this.buildPanelMessage(form, lib);
    let updated = 0;
    let removed = 0;
    const nextPanels: typeof form.panels = [] as any;

    for (const panel of form.panels ?? []) {
      try {
        const guild = await client.guilds.fetch(form.guildId);
        const channel = await guild.channels.fetch(panel.channelId);
        if (!channel || !channel.isTextBased()) {
          removed += 1;
          continue;
        }
        const message = await channel.messages.fetch(panel.messageId);
        await message.edit(payload as any);
        updated += 1;
        nextPanels.push(panel as any);
      } catch {
        removed += 1;
      }
    }

    form.panels = nextPanels as any;
    await (form as any).save();
    return { updated, removed };
  }

  async deletePostedPanel(guildId: string, formId: string, panelId: string, client?: HeimdallClient): Promise<{ form: FormDoc | null; removed: boolean }> {
    const form = await this.getForm(guildId, formId);
    if (!form) return { form: null, removed: false };
    const targetPanel = form.panels.find((panel) => panel.panelId === panelId);

    if (targetPanel && client) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(targetPanel.channelId);
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(targetPanel.messageId).catch(() => null);
          if (message) await message.delete().catch(() => null);
        }
      } catch {
        // best-effort discord cleanup
      }
    }

    const before = form.panels.length;
    form.panels = form.panels.filter((panel) => panel.panelId !== panelId) as any;
    const removed = form.panels.length !== before;
    if (removed) await (form as any).save();
    return { form, removed };
  }

  async createSubmission(input: CreateSubmissionInput): Promise<SubmissionDoc> {
    const applicationNumber = await this.getNextApplicationNumber(input.guildId);

    const submission = await ApplicationSubmission.create({
      applicationId: nanoid(16),
      applicationNumber,
      guildId: input.guildId,
      formId: input.formId,
      formName: input.formName,
      userId: input.userId,
      userDisplayName: input.userDisplayName,
      userAvatarUrl: input.userAvatarUrl,
      status: "pending",
      responses: input.responses,
      submissionChannelId: input.submissionChannelId,
      submissionMessageId: input.submissionMessageId,
      forumThreadId: input.forumThreadId,
    });

    return submission as unknown as SubmissionDoc;
  }

  async listSubmissions(
    guildId: string,
    filters?: {
      formId?: string;
      status?: "pending" | "approved" | "denied";
      userId?: string;
      limit?: number;
    },
  ): Promise<SubmissionDoc[]> {
    const query: Record<string, unknown> = { guildId };
    if (filters?.formId) query.formId = filters.formId;
    if (filters?.status) query.status = filters.status;
    if (filters?.userId) query.userId = filters.userId;

    const limit = Math.max(1, Math.min(200, filters?.limit ?? 50));
    return (await ApplicationSubmission.find(query).sort({ createdAt: -1 }).limit(limit)) as SubmissionDoc[];
  }

  async getSubmission(guildId: string, applicationId: string): Promise<SubmissionDoc | null> {
    return (await ApplicationSubmission.findOne({ guildId, applicationId })) as SubmissionDoc | null;
  }

  async getLatestSubmissionForUser(guildId: string, formId: string, userId: string): Promise<SubmissionDoc | null> {
    return (await ApplicationSubmission.findOne({ guildId, formId, userId }).sort({ createdAt: -1 })) as SubmissionDoc | null;
  }

  async updateSubmissionStatus(input: UpdateSubmissionStatusInput): Promise<SubmissionDoc | null> {
    return (await ApplicationSubmission.findOneAndUpdate(
      { guildId: input.guildId, applicationId: input.applicationId },
      {
        $set: {
          status: input.status,
          reviewedBy: input.reviewedBy,
          reviewedAt: new Date(),
          reviewReason: input.reviewReason?.trim() || null,
        },
      },
      { new: true, runValidators: true },
    )) as SubmissionDoc | null;
  }

  async updateSubmissionMessageTarget(
    guildId: string,
    applicationId: string,
    messageTarget: {
      submissionChannelId?: string;
      submissionMessageId?: string;
      forumThreadId?: string;
    },
  ): Promise<SubmissionDoc | null> {
    return (await ApplicationSubmission.findOneAndUpdate(
      { guildId, applicationId },
      {
        $set: {
          submissionChannelId: messageTarget.submissionChannelId || null,
          submissionMessageId: messageTarget.submissionMessageId || null,
          forumThreadId: messageTarget.forumThreadId || null,
        },
      },
      { new: true, runValidators: true },
    )) as SubmissionDoc | null;
  }

  async setLinkedModmailId(guildId: string, applicationId: string, linkedModmailId: string): Promise<SubmissionDoc | null> {
    return (await ApplicationSubmission.findOneAndUpdate({ guildId, applicationId }, { $set: { linkedModmailId } }, { new: true, runValidators: true })) as SubmissionDoc | null;
  }

  async deleteSubmission(guildId: string, applicationId: string): Promise<SubmissionDoc | null> {
    return (await ApplicationSubmission.findOneAndDelete({ guildId, applicationId })) as SubmissionDoc | null;
  }

  async getNextApplicationNumber(guildId: string): Promise<number> {
    const latest = await ApplicationSubmission.findOne({ guildId }).sort({ applicationNumber: -1 }).select({ applicationNumber: 1 });
    return (latest?.applicationNumber ?? 0) + 1;
  }
}
