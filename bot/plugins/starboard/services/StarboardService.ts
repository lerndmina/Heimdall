import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  EmbedBuilder,
  Message,
  type MessageReaction,
  type PartialMessageReaction,
  type Snowflake,
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

function normalizeBoardId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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
  return typeof channel === "object" && channel !== null && "messages" in channel && typeof (channel as { messages?: { fetch?: unknown } }).messages?.fetch === "function";
}

export class StarboardService {
  private client: HeimdallClient;
  private lib: LibAPI;

  constructor(client: HeimdallClient, lib: LibAPI) {
    this.client = client;
    this.lib = lib;
  }

  async getConfig(guildId: string): Promise<StarboardConfigDocument | null> {
    const config = await StarboardConfigModel.findOne({ guildId });
    if (!config) return null;

    await this.ensureBoardIds(config);
    return config;
  }

  async ensureConfig(guildId: string): Promise<StarboardConfigDocument> {
    const existing = await StarboardConfigModel.findOne({ guildId });
    if (existing) return existing;
    return StarboardConfigModel.create({ guildId, boards: [] });
  }

  async upsertBoard(guildId: string, board: Partial<IStarboardBoard> & { boardId?: string }): Promise<StarboardConfigDocument> {
    const boardId = normalizeBoardId(board.boardId) ?? nanoid(10);
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
      postAsEmbed: board.postAsEmbed ?? true,
      maxMessageAgeDays: Math.max(0, Number(board.maxMessageAgeDays ?? 0)),
      autoLockThreshold: Math.max(0, Number(board.autoLockThreshold ?? 0)),
      moderationEnabled: board.moderationEnabled ?? false,
      moderationChannelId: board.moderationChannelId ?? null,
    } satisfies IStarboardBoard;

    const updatedExisting = await StarboardConfigModel.findOneAndUpdate({ guildId, "boards.boardId": boardId }, { $set: { "boards.$": normalizedBoard } }, { new: true });

    const config = updatedExisting ?? (await StarboardConfigModel.findOneAndUpdate({ guildId }, { $setOnInsert: { guildId }, $push: { boards: normalizedBoard } }, { new: true, upsert: true }));

    if (!config) {
      throw new Error("Failed to upsert starboard configuration");
    }

    broadcastDashboardChange(guildId, "starboard", "config_updated", { requiredAction: "starboard.manage_config" });

    return config;
  }

  private async ensureBoardIds(config: StarboardConfigDocument): Promise<void> {
    let changed = false;
    const seen = new Set<string>();

    for (const board of config.boards) {
      let boardId = normalizeBoardId(board.boardId);
      if (!boardId || seen.has(boardId)) {
        boardId = nanoid(10);
        board.boardId = boardId;
        changed = true;
      }
      seen.add(boardId);
    }

    if (changed) {
      await config.save();
      log.warn(`Repaired invalid starboard board IDs for guild ${config.guildId}`);
    }
  }

  async removeBoard(guildId: string, boardId: string): Promise<boolean> {
    const normalizedBoardId = normalizeBoardId(boardId);
    if (!normalizedBoardId) return false;

    const config = await StarboardConfigModel.findOneAndUpdate(
      { guildId, "boards.boardId": normalizedBoardId },
      { $pull: { boards: { boardId: normalizedBoardId } } },
      { new: true },
    );
    if (!config) return false;

    await StarboardEntryModel.deleteMany({ guildId, boardId: normalizedBoardId });

    broadcastDashboardChange(guildId, "starboard", "config_updated", { requiredAction: "starboard.manage_config" });
    return true;
  }

  async getBoard(guildId: string, boardId: string): Promise<IStarboardBoard | null> {
    const normalizedBoardId = normalizeBoardId(boardId);
    if (!normalizedBoardId) return null;

    const config = await this.getConfig(guildId);
    if (!config) return null;
    await this.ensureBoardIds(config);
    return getBoardById(config, normalizedBoardId);
  }

  async getEntries(guildId: string, options?: { status?: string; boardId?: string; limit?: number }): Promise<StarboardEntryDocument[]> {
    const query: Record<string, unknown> = { guildId };
    if (options?.status) query.status = options.status;
    if (options?.boardId) query.boardId = options.boardId;
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
    return StarboardEntryModel.find(query).sort({ updatedAt: -1 }).limit(limit);
  }

  private async getOrCreateEntry(guildId: string, boardId: string, boardChannelId: string, message: Message): Promise<StarboardEntryDocument> {
    const existing = await StarboardEntryModel.findOne({ guildId, boardId, sourceMessageId: message.id });
    if (existing) return existing;

    const sameSourceInChannel = await StarboardEntryModel.find({
      guildId,
      sourceMessageId: message.id,
      starboardChannelId: boardChannelId,
    }).limit(2);

    if (sameSourceInChannel.length === 1) {
      const recovered = sameSourceInChannel[0];
      if (recovered && recovered.boardId !== boardId) {
        recovered.boardId = boardId;
        await recovered.save();
        log.warn(`Re-linked starboard entry ${recovered.id} to board ${boardId} in guild ${guildId}`);
      }
      if (recovered) return recovered;
    }

    return StarboardEntryModel.create({
      guildId,
      boardId,
      sourceMessageId: message.id,
      sourceChannelId: message.channelId,
      status: "pending",
      reactorIds: [],
      count: 0,
      locked: false,
    });
  }

  private async findExistingStarboardPost(channel: { messages: { fetch: (input: unknown) => Promise<unknown> } }, sourceMessage: Message): Promise<Message | null> {
    try {
      const fetched = await channel.messages.fetch({ limit: 50 });
      if (!(fetched instanceof Collection)) return null;

      for (const candidate of fetched.values()) {
        if (!(candidate instanceof Message)) continue;

        const matchesFooter = candidate.embeds.some((embed) => (embed.footer?.text ?? "").includes(sourceMessage.id));
        const matchesForwardUrl = typeof candidate.content === "string" && candidate.content.includes(sourceMessage.url);

        if (matchesFooter || matchesForwardUrl) {
          return candidate;
        }
      }
    } catch {
      // ignore fetch/search failures
    }

    return null;
  }

  private buildForwardContent(message: Message, board: IStarboardBoard, count: number): string {
    const lines: string[] = [];
    lines.push(`${board.emoji} **${count}** in <#${message.channelId}>`);
    lines.push(`**${message.author.tag}**`);

    if (message.content?.trim()) {
      lines.push(message.content.trim());
    }

    const attachmentUrls = message.attachments.map((attachment) => attachment.url).filter(Boolean);
    if (attachmentUrls.length > 0) {
      lines.push(...attachmentUrls);
    }

    lines.push(message.url);
    return lines.join("\n");
  }

  private async resolveReactionUsers(reaction: MessageReaction | PartialMessageReaction): Promise<Collection<Snowflake, User> | null> {
    try {
      return await reaction.users.fetch();
    } catch {
      return null;
    }
  }

  private async syncEntryReactionState(entry: StarboardEntryDocument, reaction: MessageReaction | PartialMessageReaction): Promise<void> {
    const users = await this.resolveReactionUsers(reaction);
    if (users) {
      const reactors = users.filter((reactor) => !reactor.bot);
      entry.reactorIds = Array.from(reactors.keys());
      entry.count = reactors.size;
      return;
    }

    entry.count = entry.reactorIds.length;
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

    const postAsEmbed = board.postAsEmbed ?? true;
    const embed = postAsEmbed ? this.buildBaseEmbed(sourceMessage, board, entry.count, `${board.emoji} ${board.name}`, 0xfacc15) : null;
    const row = postAsEmbed ? this.createJumpRow(sourceMessage) : null;
    const content = postAsEmbed ? undefined : this.buildForwardContent(sourceMessage, board, entry.count);

    if (entry.starboardMessageId) {
      const msg = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
      if (msg) {
        await msg.edit({
          content,
          embeds: embed ? [embed] : [],
          components: row ? [row] : [],
        });
        return;
      }
    }

    const existingPosted = await this.findExistingStarboardPost(channel as unknown as { messages: { fetch: (input: unknown) => Promise<unknown> } }, sourceMessage);
    if (existingPosted) {
      entry.starboardMessageId = existingPosted.id;
      entry.starboardChannelId = channel.id;
      await existingPosted.edit({
        content,
        embeds: embed ? [embed] : [],
        components: row ? [row] : [],
      });
      if (entry.status === "pending") entry.status = "approved";
      return;
    }

    const posted = await channel.send({
      content,
      embeds: embed ? [embed] : [],
      components: row ? [row] : [],
    });
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
    await this.ensureBoardIds(config);

    for (const board of config.boards) {
      if (!normalizeBoardId(board.boardId)) continue;
      if (!reactionMatchesEmoji(reaction, board.emoji)) continue;
      if (!this.isEligibleByBoardRules(message, user.id, board)) continue;

      const entry = await this.getOrCreateEntry(message.guildId, board.boardId, board.channelId, message);
      await this.syncEntryReactionState(entry, reaction);

      if (entry.count >= board.threshold) {
        const shouldUseModeration = board.moderationEnabled && !!board.moderationChannelId;

        if (shouldUseModeration) {
          if (entry.status === "denied") {
            await entry.save();
            continue;
          }

          const alreadyPosted = !!entry.starboardMessageId && (entry.status === "approved" || entry.status === "posted");
          if (!alreadyPosted) {
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
    await this.ensureBoardIds(config);

    for (const board of config.boards) {
      if (!normalizeBoardId(board.boardId)) continue;
      if (!reactionMatchesEmoji(reaction, board.emoji)) continue;

      const entry = await StarboardEntryModel.findOne({
        guildId: message.guildId,
        boardId: board.boardId,
        sourceMessageId: message.id,
      });
      if (!entry) continue;

      await this.syncEntryReactionState(entry, reaction);

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
