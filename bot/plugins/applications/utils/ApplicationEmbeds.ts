import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type APIEmbedField, type MessageActionRowComponentBuilder } from "discord.js";
import type { LibAPI } from "../../lib/index.js";
import type { IApplicationSubmission } from "../models/ApplicationSubmission.js";

export function toAnswerText(value?: string | null, values?: string[] | null): string {
  if (Array.isArray(values) && values.length > 0) return values.map((entry) => `• ${entry}`).join("\n");
  if (value && value.trim().length > 0) return value;
  return "_No answer_";
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function buildReviewComponents(lib: LibAPI, applicationId: string, dashboardUrl?: string, disabled = false): Promise<ActionRowBuilder<MessageActionRowComponentBuilder>[]> {
  const approveButton = lib.createButtonBuilderPersistent("applications.review.approve", { applicationId });
  approveButton.setLabel("Approve").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(disabled);
  await approveButton.ready();

  const denyButton = lib.createButtonBuilderPersistent("applications.review.deny", { applicationId });
  denyButton.setLabel("Deny").setEmoji("❌").setStyle(ButtonStyle.Danger).setDisabled(disabled);
  await denyButton.ready();

  const approveReasonButton = lib.createButtonBuilderPersistent("applications.review.approve_reason", { applicationId });
  approveReasonButton.setLabel("Approve w/ Reason").setEmoji("✅").setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  await approveReasonButton.ready();

  const denyReasonButton = lib.createButtonBuilderPersistent("applications.review.deny_reason", { applicationId });
  denyReasonButton.setLabel("Deny w/ Reason").setEmoji("❌").setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  await denyReasonButton.ready();

  const modmailButton = lib.createButtonBuilderPersistent("applications.review.modmail", { applicationId });
  modmailButton.setLabel("Open Modmail").setEmoji("📬").setStyle(ButtonStyle.Primary).setDisabled(disabled);
  await modmailButton.ready();

  const firstRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    approveButton as MessageActionRowComponentBuilder,
    denyButton as MessageActionRowComponentBuilder,
    approveReasonButton as MessageActionRowComponentBuilder,
    denyReasonButton as MessageActionRowComponentBuilder,
  );

  const secondRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(modmailButton as MessageActionRowComponentBuilder);

  if (dashboardUrl) {
    secondRow.addComponents(new ButtonBuilder().setLabel("View in Dashboard").setStyle(ButtonStyle.Link).setURL(dashboardUrl) as unknown as MessageActionRowComponentBuilder);
  }

  return [firstRow, secondRow];
}

export function buildSubmissionEmbeds(lib: LibAPI, submission: IApplicationSubmission): ReturnType<LibAPI["createEmbedBuilder"]>[] {
  const responseFields: APIEmbedField[] = submission.responses.map((response) => ({
    name: response.questionLabel,
    value: toAnswerText(response.value, response.values).slice(0, 1024),
    inline: false,
  }));

  const responseChunks = chunkArray(responseFields, 25);
  const color = submission.status === "approved" ? "Green" : submission.status === "denied" ? "Red" : "Blurple";
  const embeds: ReturnType<LibAPI["createEmbedBuilder"]>[] = [];

  const totalResponseEmbeds = Math.max(1, responseChunks.length);
  for (let index = 0; index < totalResponseEmbeds; index += 1) {
    const embed = lib
      .createEmbedBuilder()
      .setTitle(
        totalResponseEmbeds > 1
          ? `Application #${submission.applicationNumber} — ${submission.formName} (${index + 1}/${totalResponseEmbeds})`
          : `Application #${submission.applicationNumber} — ${submission.formName}`,
      )
      .setColor(color)
      .setTimestamp(new Date(submission.createdAt || Date.now()))
      .setFooter({ text: `Application ID: ${submission.applicationId}` });

    if (index === 0) {
      embed.setAuthor({
        name: submission.userDisplayName,
        iconURL: submission.userAvatarUrl || undefined,
      });
    }

    const responseChunk = responseChunks[index] ?? [];
    if (responseChunk.length > 0) {
      embed.addFields(responseChunk);
    }

    embeds.push(embed);
  }

  const metaFields: APIEmbedField[] = [];
  if (submission.status !== "pending") {
    metaFields.push(
      { name: "Status", value: submission.status.toUpperCase(), inline: true },
      { name: "Reviewed By", value: submission.reviewedBy ? `<@${submission.reviewedBy}>` : "Unknown", inline: true },
      { name: "Reason", value: submission.reviewReason || "No reason provided", inline: false },
    );
  }
  if (submission.linkedModmailId) {
    metaFields.push({ name: "Linked Modmail", value: submission.linkedModmailId, inline: true });
  }

  if (metaFields.length > 0) {
    const lastEmbed = embeds[embeds.length - 1];
    const lastChunk = responseChunks.length > 0 ? responseChunks[responseChunks.length - 1] : undefined;
    const lastChunkFieldCount = lastChunk?.length ?? 0;

    if (lastEmbed && lastChunkFieldCount + metaFields.length <= 25) {
      lastEmbed.addFields(metaFields);
    } else if (embeds.length < 10) {
      const metaEmbed = lib
        .createEmbedBuilder()
        .setTitle(`Application #${submission.applicationNumber} — ${submission.formName} (Meta)`)
        .setColor(color)
        .setTimestamp(new Date(submission.createdAt || Date.now()))
        .setFooter({ text: `Application ID: ${submission.applicationId}` })
        .addFields(metaFields);
      embeds.push(metaEmbed);
    }
  }

  if (embeds.length > 10) {
    return embeds.slice(0, 10);
  }

  return embeds;
}
