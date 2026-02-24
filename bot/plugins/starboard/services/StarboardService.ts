import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
  type GuildMember,
  type APIEmbedField,
} from "discord.js";
import { nanoid } from "nanoid";

import { createLogger } from "../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import StarboardConfigModel, { type IStarboardBoard, type StarboardConfigDocument } from "../models/StarboardConfig.js";
import StarboardEntryModel, { type StarboardEntryDocument } from "../models/StarboardEntry.js";
import { STARBOARD_APPROVE_HANDLER_ID, STARBOARD_DENY_HANDLER_ID } from "../index.js";

const log = createLogger("starboard:service");

type OperationResult = { ok: true } | { ok: false; error: string };

function normalizeEmoji(value: string): string {
  return value.trim();
}

function reactionMatchesEmoji(reaction: MessageReaction | PartialMessageReaction, configuredEmoji: string): boolean {
  const normalized = normalizeEmoji(configuredEmoji);
  const customMatch = normalized.match(/^<a?:[^:>]+:(\d+)>$/);
  if (customMatch) {
    return reaction.emoji.id === customMatch[1];
  }

  return reaction.emoji.name === normalized;
}

function getBoardById(config: StarboardConfigDocument, boardId: string): IStarboardBoard | null {
  const board = config.boards.find((b) => b.boardId === boardId);
  return board ?? null;
}

function canSendMessages(channel: unknown): channel is { id: string; send: (payload: unknown) => Promise<{ id: string }> } {
  return typeof channel === "object" && channel !== null && "send" in channel && typeof (channel as { send?: unknown }).send === "function";
}

function canFetchMessages(channel: unknown): channel is { messages: { fetch: (id: string) => Promise<Message> } } {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "messages" in channel &&
    typeof (channel as { messages?: { fetch?: unknown } }).messages?.fetch === "function"
  );
}

export class StarboardService {
  private client: HeimdallClient;
  private lib: LibAPI;

  constructor(client: HeimdallClient, lib: LibAPI) {
    this.client = client;
    this.lib = lib;
  }

  async getConfig(guildId: string): Promise<StarboardConfigDocument | null> {
    return StarboardConfigModel.findOne({ guildId });
  }

  async ensureConfig(guildId: string): Promise<StarboardConfigDocument> {
    const existing = await StarboardConfigModel.findOne({ guildId });
    if (existing) return existing;
    return StarboardConfigModel.create({ guildId, boards: [] });
  }

  async upsertBoard(guildId: string, board: Partial<IStarboardBoard> & { boardId?: string }): Promise<StarboardConfigDocument> {
    const boardId = board.boardId ?? nanoid(10);
    const normalizedBoard = {
      boardId,
      name: (board.name ?? "Starboard").trim(),
      emoji: normalizeEmoji(board.emoji ?? "⭐"),
      channelId: board.channelId ?? "",
      threshold: Math.max(1, Number(board.threshold ?? 3)),
      enabled: board.enabled ?? true,
      selfStar: board.selfStar ?? false,
      removeOnUnreact: board.removeOnUnreact ?? true,
      ignoredChannelIds: board.ignoredChannelIds ?? [],
      ignoredRoleIds: board.ignoredRoleIds ?? [],
      requiredRoleIds: board.requiredRoleIds ?? [],
      allowNSFW: board.allowNSFW ?? false,
      maxMessageAgeDays: Math.max(0, Number(board.maxMessageAgeDays ?? 0)),
      autoLockThreshold: Math.max(0, Number(board.autoLockThreshold ?? 0)),
      moderationEnabled: board.moderationEnabled ?? false,
      moderationChannelId: board.moderationChannelId ?? null,
    } satisfies IStarboardBoard;

    const updatedExisting = await StarboardConfigModel.findOneAndUpdate(
      { guildId, "boards.boardId": boardId },
      { $set: { "boards.$": normalizedBoard } },
      { new: true },
    );

    const config =
      updatedExisting ??
      (await StarboardConfigModel.findOneAndUpdate({ guildId }, { $setOnInsert: { guildId }, $push: { boards: normalizedBoard } }, { new: true, upsert: true }));

    if (!config) {
      throw new Error("Failed to upsert starboard configuration");
    }

    broadcastDashboardChange(guildId, "starboard", "config_updated", { requiredAction: "starboard.manage_config" });

    return config;
  }

  async removeBoard(guildId: string, boardId: string): Promise<boolean> {
    const config = await StarboardConfigModel.findOneAndUpdate({ guildId, "boards.boardId": boardId }, { $pull: { boards: { boardId } } }, { new: true });
    if (!config) return false;

    await StarboardEntryModel.deleteMany({ guildId, boardId });

    broadcastDashboardChange(guildId, "starboard", "config_updated", { requiredAction: "starboard.manage_config" });
    return true;
  }

  async getBoard(guildId: string, boardId: string): Promise<IStarboardBoard | null> {
    const config = await this.getConfig(guildId);
    if (!config) return null;
    return getBoardById(config, boardId);
  }

  async getEntries(guildId: string, options?: { status?: string; boardId?: string; limit?: number }): Promise<StarboardEntryDocument[]> {
    const query: Record<string, unknown> = { guildId };
    if (options?.status) query.status = options.status;
    if (options?.boardId) query.boardId = options.boardId;
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
    return StarboardEntryModel.find(query).sort({ updatedAt: -1 }).limit(limit);
  }

  private async getOrCreateEntry(guildId: string, boardId: string, message: Message): Promise<StarboardEntryDocument> {
    const existing = await StarboardEntryModel.findOne({ guildId, boardId, sourceMessageId: message.id });
    if (existing) return existing;

    return StarboardEntryModel.create({
      guildId,
      boardId,
      sourceMessageId: message.id,
      sourceChannelId: message.channelId,
      status: "posted",
      reactorIds: [],
      count: 0,
      locked: false,
    });
  }

  private getImageUrlFromMessage(message: Message): string | null {
    const attachment = message.attachments.find((att) => att.contentType?.startsWith("image/") || (!!att.name && /\.(png|jpe?g|gif|webp)$/i.test(att.name)));
    if (attachment?.url) return attachment.url;

    const firstEmbedImage = message.embeds.find((embed) => embed.image?.url)?.image?.url;
    if (firstEmbedImage) return firstEmbedImage;

    return null;
  }

  private buildBaseEmbed(message: Message, board: IStarboardBoard, count: number, title: string, color: number): EmbedBuilder {
    const fields: APIEmbedField[] = [];
    fields.push({ name: "Source", value: `<#${message.channelId}>`, inline: true });
    fields.push({ name: "Reactions", value: `${board.emoji} **${count}**`, inline: true });

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTitle(title)
      .setDescription(message.content?.slice(0, 4000) || "*(no text content)*")
      .addFields(fields)
      .setTimestamp(message.createdAt)
      .setFooter({ text: `${board.name} • ${message.id}` });

    const image = this.getImageUrlFromMessage(message);
    if (image) embed.setImage(image);

    return embed;
  }

  private createJumpRow(message: Message): ActionRowBuilder<ButtonBuilder> {
    const jumpButton = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Jump to Message").setURL(message.url);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(jumpButton);
  }

  private async postOrUpdateStarboardMessage(entry: StarboardEntryDocument, board: IStarboardBoard, sourceMessage: Message): Promise<void> {
    const channel = await this.client.channels.fetch(board.channelId).catch(() => null);
    if (!channel || !canSendMessages(channel) || !canFetchMessages(channel)) {
      log.warn(`Starboard channel ${board.channelId} not found or not text-based for guild ${entry.guildId}`);
      return;
    }

    const embed = this.buildBaseEmbed(sourceMessage, board, entry.count, `${board.emoji} ${board.name}`, 0xfacc15);
    const row = this.createJumpRow(sourceMessage);

    if (entry.starboardMessageId) {
      const msg = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: [row] });
        return;
      }
    }

    const posted = await channel.send({ embeds: [embed], components: [row] });
    entry.starboardMessageId = posted.id;
    entry.starboardChannelId = channel.id;
    if (entry.status === "pending") entry.status = "approved";
  }

  private async postOrUpdateModerationMessage(entry: StarboardEntryDocument, board: IStarboardBoard, sourceMessage: Message): Promise<void> {
    if (!board.moderationChannelId) return;

    const channel = await this.client.channels.fetch(board.moderationChannelId).catch(() => null);
    if (!channel || !canSendMessages(channel) || !canFetchMessages(channel)) {
      log.warn(`Moderation channel ${board.moderationChannelId} not found or not text-based for guild ${entry.guildId}`);
      return;
    }

    const embed = this.buildBaseEmbed(sourceMessage, board, entry.count, `Pending ${board.name} Approval`, 0xf59e0b).setFooter({
      text: `Pending • ${board.name} • ${sourceMessage.id}`,
    });

    const approveButton = this.lib
      .createButtonBuilderPersistent(STARBOARD_APPROVE_HANDLER_ID, {
        guildId: entry.guildId,
        boardId: entry.boardId,
        sourceMessageId: entry.sourceMessageId,
      })
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅");

    const denyButton = this.lib
      .createButtonBuilderPersistent(STARBOARD_DENY_HANDLER_ID, {
        guildId: entry.guildId,
        boardId: entry.boardId,
        sourceMessageId: entry.sourceMessageId,
      })
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌");

    await Promise.all([approveButton.ready(), denyButton.ready()]);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, denyButton);
    const jumpRow = this.createJumpRow(sourceMessage);

    if (entry.moderationMessageId) {
      const msg = await channel.messages.fetch(entry.moderationMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: [row, jumpRow] });
        return;
      }
    }

    const posted = await channel.send({ embeds: [embed], components: [row, jumpRow] });
    entry.moderationMessageId = posted.id;
    entry.moderationChannelId = channel.id;
  }

  private async markModerationMessageProcessed(entry: StarboardEntryDocument, approved: boolean, moderatorId: string): Promise<void> {
    if (!entry.moderationMessageId || !entry.moderationChannelId) return;

    const channel = await this.client.channels.fetch(entry.moderationChannelId).catch(() => null);
    if (!channel || !canFetchMessages(channel)) return;

    const msg = await channel.messages.fetch(entry.moderationMessageId).catch(() => null);
    if (!msg) return;

    const statusText = approved ? `✅ Approved by <@${moderatorId}>` : `❌ Denied by <@${moderatorId}>`;
    await msg.edit({ content: statusText, components: [] }).catch(() => null);
  }

  private isEligibleByBoardRules(message: Message, userId: string, board: IStarboardBoard): boolean {
    if (!message.guild) return false;

    if (!board.enabled) return false;
    if (!board.channelId) return false;

    if (!board.selfStar && message.author.id === userId) return false;

    if (board.ignoredChannelIds.includes(message.channelId)) return false;

    if (!board.allowNSFW && message.channel?.isTextBased()) {
      const channelAny = message.channel as unknown as { nsfw?: boolean };
      if (channelAny.nsfw === true) return false;
    }

    if (board.maxMessageAgeDays > 0) {
      const ageMs = Date.now() - message.createdTimestamp;
      const maxAgeMs = board.maxMessageAgeDays * 24 * 60 * 60 * 1000;
      if (ageMs > maxAgeMs) return false;
    }

    if ((board.ignoredRoleIds.length > 0 || board.requiredRoleIds.length > 0) && message.member) {
      const roleIds = (message.member as GuildMember).roles.cache.map((role) => role.id);

      if (board.ignoredRoleIds.some((roleId) => roleIds.includes(roleId))) return false;
      if (board.requiredRoleIds.length > 0 && !board.requiredRoleIds.some((roleId) => roleIds.includes(roleId))) return false;
    }

    return true;
  }

  async handleReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
    if (user.bot) return;

    const message = reaction.message;
    if (message.partial || !message.guildId || !message.guild) return;

    const config = await this.getConfig(message.guildId);
    if (!config || config.boards.length === 0) return;

    for (const board of config.boards) {
      if (!reactionMatchesEmoji(reaction, board.emoji)) continue;
      if (!this.isEligibleByBoardRules(message, user.id, board)) continue;

      const entry = await this.getOrCreateEntry(message.guildId, board.boardId, message);

      if (!entry.reactorIds.includes(user.id)) {
        entry.reactorIds.push(user.id);
      }
      entry.count = entry.reactorIds.length;

      if (entry.count >= board.threshold) {
        const shouldUseModeration = board.moderationEnabled && !!board.moderationChannelId;

        if (shouldUseModeration) {
          if (entry.status === "denied") {
            await entry.save();
            continue;
          }

          if (entry.status !== "approved" && entry.status !== "posted") {
            entry.status = "pending";
            await this.postOrUpdateModerationMessage(entry, board, message);
          } else {
            await this.postOrUpdateStarboardMessage(entry, board, message);
          }
        } else {
          entry.status = "posted";
          await this.postOrUpdateStarboardMessage(entry, board, message);
        }
      }

      if (board.autoLockThreshold > 0 && entry.count >= board.autoLockThreshold && !entry.locked) {
        entry.locked = true;
      }

      await entry.save();
    }
  }

  async handleReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
    if (user.bot) return;

    const message = reaction.message;
    if (message.partial || !message.guildId || !message.guild) return;

    const config = await this.getConfig(message.guildId);
    if (!config || config.boards.length === 0) return;

    for (const board of config.boards) {
      if (!reactionMatchesEmoji(reaction, board.emoji)) continue;

      const entry = await StarboardEntryModel.findOne({
        guildId: message.guildId,
        boardId: board.boardId,
        sourceMessageId: message.id,
      });
      if (!entry) continue;

      entry.reactorIds = entry.reactorIds.filter((id) => id !== user.id);
      entry.count = entry.reactorIds.length;

      const belowThreshold = entry.count < board.threshold;
      if (belowThreshold) {
        if (entry.status === "pending") {
          await this.deleteEntryMessages(entry);
          await entry.deleteOne();
          continue;
        }

        if (board.removeOnUnreact) {
          await this.deleteEntryMessages(entry);
          await entry.deleteOne();
          continue;
        }
      }

      if (entry.status === "pending") {
        await this.postOrUpdateModerationMessage(entry, board, message);
      } else if (entry.status === "posted" || entry.status === "approved") {
        await this.postOrUpdateStarboardMessage(entry, board, message);
      }

      await entry.save();
    }
  }

  async handleSourceMessageDelete(guildId: string, sourceMessageId: string): Promise<void> {
    const entries = await StarboardEntryModel.find({ guildId, sourceMessageId });
    for (const entry of entries) {
      await this.deleteEntryMessages(entry);
      await entry.deleteOne();
    }
  }

  async handleAnyMessageDelete(guildId: string, messageId: string): Promise<void> {
    const entries = await StarboardEntryModel.find({
      guildId,
      $or: [{ sourceMessageId: messageId }, { starboardMessageId: messageId }, { moderationMessageId: messageId }],
    });

    for (const entry of entries) {
      await this.deleteEntryMessages(entry);
      await entry.deleteOne();
    }
  }

  private async deleteEntryMessages(entry: StarboardEntryDocument): Promise<void> {
    if (entry.starboardMessageId && entry.starboardChannelId) {
      const starboardChannel = await this.client.channels.fetch(entry.starboardChannelId).catch(() => null);
      if (starboardChannel && canFetchMessages(starboardChannel)) {
        const msg = await starboardChannel.messages.fetch(entry.starboardMessageId).catch(() => null);
        await msg?.delete().catch(() => null);
      }
    }

    if (entry.moderationMessageId && entry.moderationChannelId) {
      const modChannel = await this.client.channels.fetch(entry.moderationChannelId).catch(() => null);
      if (modChannel && canFetchMessages(modChannel)) {
        const msg = await modChannel.messages.fetch(entry.moderationMessageId).catch(() => null);
        await msg?.delete().catch(() => null);
      }
    }
  }

  private async fetchSourceMessage(entry: StarboardEntryDocument): Promise<Message | null> {
    const channel = await this.client.channels.fetch(entry.sourceChannelId).catch(() => null);
    if (!channel || !canFetchMessages(channel)) return null;
    return channel.messages.fetch(entry.sourceMessageId).catch(() => null);
  }

  async approvePendingEntry(guildId: string, boardId: string, sourceMessageId: string, moderatorId: string): Promise<OperationResult> {
    const entry = await StarboardEntryModel.findOne({ guildId, boardId, sourceMessageId });
    if (!entry) return { ok: false, error: "Entry not found." };
    if (entry.status !== "pending") return { ok: false, error: "Entry is no longer pending." };

    const board = await this.getBoard(guildId, boardId);
    if (!board) return { ok: false, error: "Board not found." };

    const sourceMessage = await this.fetchSourceMessage(entry);
    if (!sourceMessage) return { ok: false, error: "Source message was not found." };

    entry.status = "approved";
    entry.moderatedBy = moderatorId;
    entry.moderatedAt = new Date();

    await this.postOrUpdateStarboardMessage(entry, board, sourceMessage);
    await entry.save();

    await this.markModerationMessageProcessed(entry, true, moderatorId);

    broadcastDashboardChange(guildId, "starboard", "entry_approved", {
      requiredAction: "starboard.moderate",
      data: { boardId, sourceMessageId },
    });

    return { ok: true };
  }

  async denyPendingEntry(guildId: string, boardId: string, sourceMessageId: string, moderatorId: string): Promise<OperationResult> {
    const entry = await StarboardEntryModel.findOne({ guildId, boardId, sourceMessageId });
    if (!entry) return { ok: false, error: "Entry not found." };
    if (entry.status !== "pending") return { ok: false, error: "Entry is no longer pending." };

    entry.status = "denied";
    entry.moderatedBy = moderatorId;
    entry.moderatedAt = new Date();
    await entry.save();

    await this.markModerationMessageProcessed(entry, false, moderatorId);

    broadcastDashboardChange(guildId, "starboard", "entry_denied", {
      requiredAction: "starboard.moderate",
      data: { boardId, sourceMessageId },
    });

    return { ok: true };
  }
}
