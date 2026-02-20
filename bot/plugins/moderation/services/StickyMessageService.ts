/**
 * StickyMessageService — Manages sticky messages that persist at the
 * bottom of channels by deleting and re-posting on every new message.
 *
 * Features:
 * - One sticky per channel
 * - Cooldown to avoid API spam in active channels
 * - Plain text or embed mode
 * - Integrates with tags for content sourcing
 */

import { type TextChannel, type NewsChannel, EmbedBuilder } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import StickyMessage, { type IStickyMessage } from "../models/StickyMessage.js";

const log = createLogger("moderation:sticky");

type StickyDoc = IStickyMessage & { _id: any; createdAt: Date; updatedAt: Date };

/** Minimum interval between sticky refreshes per channel (instant mode, in ms) */
const REFRESH_COOLDOWN_MS = 5_000;

export class StickyMessageService {
  private client: HeimdallClient;
  /** Per-channel timestamp of last refresh to enforce cooldown (instant mode) */
  private lastRefresh = new Map<string, number>();
  /** Per-channel debounce timers for conversation-aware mode */
  private conversationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(client: HeimdallClient) {
    this.client = client;
  }

  // ── CRUD ─────────────────────────────────────────────────

  /**
   * Set (create or update) a sticky message for a channel.
   */
  async setSticky(
    guildId: string,
    channelId: string,
    content: string,
    moderatorId: string,
    options?: {
      color?: number;
      useEmbed?: boolean;
      embedTitle?: string | null;
      embedImage?: string | null;
      embedThumbnail?: string | null;
      embedFooter?: string | null;
      detectionBehavior?: string;
      detectionDelay?: number;
      conversationDuration?: number;
      conversationDeleteBehavior?: string;
      sendOrder?: number;
    },
  ): Promise<StickyDoc> {
    const channel = this.client.channels.cache.get(channelId) as TextChannel | NewsChannel | undefined;

    // Remove existing sticky message from chat if present
    const existing = await StickyMessage.findOne({ channelId });
    if (existing?.currentMessageId && channel) {
      try {
        const old = await channel.messages.fetch(existing.currentMessageId);
        await old.delete();
      } catch {
        // Already deleted
      }
    }

    // Build update document, only including provided options
    const updateDoc: Record<string, any> = {
      guildId,
      channelId,
      content,
      moderatorId,
      color: options?.color ?? 0,
      enabled: true,
      currentMessageId: null,
    };
    if (options?.useEmbed !== undefined) updateDoc.useEmbed = options.useEmbed;
    if (options?.embedTitle !== undefined) updateDoc.embedTitle = options.embedTitle;
    if (options?.embedImage !== undefined) updateDoc.embedImage = options.embedImage;
    if (options?.embedThumbnail !== undefined) updateDoc.embedThumbnail = options.embedThumbnail;
    if (options?.embedFooter !== undefined) updateDoc.embedFooter = options.embedFooter;
    if (options?.detectionBehavior !== undefined) updateDoc.detectionBehavior = options.detectionBehavior;
    if (options?.detectionDelay !== undefined) updateDoc.detectionDelay = options.detectionDelay;
    if (options?.conversationDuration !== undefined) updateDoc.conversationDuration = options.conversationDuration;
    if (options?.conversationDeleteBehavior !== undefined) updateDoc.conversationDeleteBehavior = options.conversationDeleteBehavior;
    if (options?.sendOrder !== undefined) updateDoc.sendOrder = options.sendOrder;

    // Upsert the sticky record
    const doc = await StickyMessage.findOneAndUpdate({ channelId }, updateDoc, { upsert: true, new: true, runValidators: true });

    // Send initial sticky message
    if (channel) {
      await this.postSticky(channel, doc as StickyDoc);
    }

    return doc as unknown as StickyDoc;
  }

  /**
   * Remove a sticky message from a channel.
   */
  async removeSticky(channelId: string): Promise<boolean> {
    const existing = await StickyMessage.findOne({ channelId });
    if (!existing) return false;

    // Delete the posted message
    if (existing.currentMessageId) {
      try {
        const channel = this.client.channels.cache.get(channelId) as TextChannel | undefined;
        if (channel) {
          const msg = await channel.messages.fetch(existing.currentMessageId);
          await msg.delete();
        }
      } catch {
        // Already deleted
      }
    }

    await StickyMessage.deleteOne({ channelId });
    this.lastRefresh.delete(channelId);
    // Clear any pending conversation timer
    const timer = this.conversationTimers.get(channelId);
    if (timer) {
      clearTimeout(timer);
      this.conversationTimers.delete(channelId);
    }
    return true;
  }

  /**
   * Get the sticky message config for a channel.
   */
  async getSticky(channelId: string): Promise<StickyDoc | null> {
    return StickyMessage.findOne({ channelId }).lean() as Promise<StickyDoc | null>;
  }

  /**
   * Get all sticky messages for a guild.
   */
  async getGuildStickies(guildId: string): Promise<StickyDoc[]> {
    return StickyMessage.find({ guildId }).sort({ createdAt: -1 }).lean() as Promise<StickyDoc[]>;
  }

  /**
   * Toggle a sticky message on/off without deleting the config.
   */
  async toggleSticky(channelId: string, enabled: boolean): Promise<StickyDoc | null> {
    const doc = await StickyMessage.findOneAndUpdate({ channelId }, { enabled }, { new: true });
    if (!doc) return null;

    if (!enabled && doc.currentMessageId) {
      // Remove the posted message when disabling
      try {
        const channel = this.client.channels.cache.get(channelId) as TextChannel | undefined;
        if (channel) {
          const msg = await channel.messages.fetch(doc.currentMessageId);
          await msg.delete();
        }
      } catch {
        // Already deleted
      }
      await StickyMessage.updateOne({ channelId }, { currentMessageId: null });
    } else if (enabled) {
      // Re-post when enabling
      const channel = this.client.channels.cache.get(channelId) as TextChannel | NewsChannel | undefined;
      if (channel) await this.postSticky(channel, doc as unknown as StickyDoc);
    }

    return doc as unknown as StickyDoc;
  }

  // ── Refresh Logic ────────────────────────────────────────

  /**
   * Called from the messageCreate event handler.
   * Routes to instant or conversation-aware refresh depending on config.
   */
  async handleNewMessage(channel: TextChannel | NewsChannel): Promise<void> {
    const sticky = await StickyMessage.findOne({ channelId: channel.id, enabled: true });
    if (!sticky) return;

    const doc = sticky as unknown as StickyDoc;

    if (doc.detectionBehavior === "delay") {
      await this.handleConversationAware(channel, doc);
    } else {
      await this.handleInstant(channel, doc);
    }
  }

  /**
   * Instant mode: delete old → send new with a simple cooldown.
   */
  private async handleInstant(channel: TextChannel | NewsChannel, sticky: StickyDoc): Promise<void> {
    const now = Date.now();
    const last = this.lastRefresh.get(channel.id) ?? 0;

    // Enforce cooldown to avoid API spam
    if (now - last < REFRESH_COOLDOWN_MS) return;

    this.lastRefresh.set(channel.id, now);

    // Delete old sticky
    if (sticky.currentMessageId) {
      try {
        const oldMsg = await channel.messages.fetch(sticky.currentMessageId);
        await oldMsg.delete();
      } catch {
        // Already deleted
      }
    }

    // Send new sticky
    await this.postSticky(channel, sticky);
  }

  /**
   * Conversation-aware mode: debounce the sticky refresh.
   * When a new message arrives, (optionally) delete the old sticky immediately,
   * then reset a timer. Only resend the sticky after the configured delay
   * has elapsed with no new messages (= conversation ended).
   */
  private async handleConversationAware(channel: TextChannel | NewsChannel, sticky: StickyDoc): Promise<void> {
    const delayMs = ((sticky.conversationDuration ?? 10) + (sticky.detectionDelay ?? 5)) * 1000;

    // If configured to delete immediately, remove the old sticky on first message
    if (sticky.conversationDeleteBehavior === "immediate" && sticky.currentMessageId) {
      // Only delete once — check if we already removed it for this conversation
      const existingTimer = this.conversationTimers.get(channel.id);
      if (!existingTimer) {
        try {
          const oldMsg = await channel.messages.fetch(sticky.currentMessageId);
          await oldMsg.delete();
        } catch {
          // Already deleted
        }
        await StickyMessage.updateOne({ channelId: channel.id }, { currentMessageId: null });
      }
    }

    // Clear any existing timer and set a new one (debounce)
    const existingTimer = this.conversationTimers.get(channel.id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
      this.conversationTimers.delete(channel.id);

      // Refetch to get latest state
      const current = await StickyMessage.findOne({ channelId: channel.id, enabled: true });
      if (!current) return;

      const currentDoc = current as unknown as StickyDoc;

      // Delete old sticky if not already deleted (after_conversation mode)
      if (currentDoc.currentMessageId) {
        try {
          const oldMsg = await channel.messages.fetch(currentDoc.currentMessageId);
          await oldMsg.delete();
        } catch {
          // Already deleted
        }
      }

      // Resend sticky
      await this.postSticky(channel, currentDoc);
    }, delayMs);

    this.conversationTimers.set(channel.id, timer);
  }

  /**
   * Check if a channel has an active sticky. Fast path for event handler.
   */
  async hasSticky(channelId: string): Promise<boolean> {
    return (await StickyMessage.countDocuments({ channelId, enabled: true })) > 0;
  }

  // ── Internal ─────────────────────────────────────────────

  /**
   * Post the sticky message and save the new message ID.
   */
  private async postSticky(channel: TextChannel | NewsChannel, sticky: StickyDoc): Promise<void> {
    try {
      let sent;
      // Use embed mode if useEmbed is true, or legacy behavior: color > 0
      const shouldEmbed = (sticky as any).useEmbed || (sticky.color && sticky.color > 0);
      if (shouldEmbed) {
        const embed = new EmbedBuilder();
        if (sticky.color && sticky.color > 0) embed.setColor(sticky.color);
        if ((sticky as any).embedTitle) embed.setTitle((sticky as any).embedTitle);
        if (sticky.content) embed.setDescription(sticky.content);
        if ((sticky as any).embedImage) embed.setImage((sticky as any).embedImage);
        if ((sticky as any).embedThumbnail) embed.setThumbnail((sticky as any).embedThumbnail);
        embed.setFooter({ text: (sticky as any).embedFooter || "📌 Sticky Message" });
        sent = await channel.send({ embeds: [embed] });
      } else {
        sent = await channel.send({ content: `📌 ${sticky.content}` });
      }

      await StickyMessage.updateOne({ channelId: channel.id }, { currentMessageId: sent.id });
    } catch (error) {
      log.error(`Failed to post sticky in ${channel.id}:`, error);
    }
  }
}
