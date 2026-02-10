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

/** Minimum interval between sticky refreshes per channel (in ms) */
const REFRESH_COOLDOWN_MS = 5_000;

export class StickyMessageService {
  private client: HeimdallClient;
  /** Per-channel timestamp of last refresh to enforce cooldown */
  private lastRefresh = new Map<string, number>();

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
    options?: { color?: number },
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

    // Upsert the sticky record
    const doc = await StickyMessage.findOneAndUpdate(
      { channelId },
      {
        guildId,
        channelId,
        content,
        moderatorId,
        color: options?.color ?? 0,
        enabled: true,
        currentMessageId: null,
      },
      { upsert: true, new: true, runValidators: true },
    );

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
    const doc = await StickyMessage.findOneAndUpdate(
      { channelId },
      { enabled },
      { new: true },
    );
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
   * Checks if the channel has an active sticky and refreshes it
   * (delete old → send new) with cooldown protection.
   */
  async handleNewMessage(channel: TextChannel | NewsChannel): Promise<void> {
    const now = Date.now();
    const last = this.lastRefresh.get(channel.id) ?? 0;

    // Enforce cooldown to avoid API spam
    if (now - last < REFRESH_COOLDOWN_MS) return;

    const sticky = await StickyMessage.findOne({ channelId: channel.id, enabled: true });
    if (!sticky) return;

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
    await this.postSticky(channel, sticky as unknown as StickyDoc);
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
      if (sticky.color && sticky.color > 0) {
        const embed = new EmbedBuilder().setColor(sticky.color).setDescription(sticky.content).setFooter({ text: "📌 Sticky Message" });
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
