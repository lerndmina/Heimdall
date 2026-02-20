/**
 * CensusMonitorService — Monitors Census + Honu API health
 *
 * Polls both APIs on an interval, tracks consecutive failures/successes,
 * and updates a persistent embed in a configured channel.
 */

import { type Client, type TextChannel, ChannelType } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { LibAPI } from "../../lib/index.js";
import { PlanetSideApiService } from "./PlanetSideApiService.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import CensusStatus from "../models/CensusStatus.js";

const log = createLogger("planetside:census-monitor");

/** How often to poll (ms) */
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** Consecutive pings before flipping status */
const THRESHOLD = 6;

/** Startup retry config */
const STARTUP_RETRIES = 3;
const STARTUP_RETRY_DELAY = 10_000;

export class CensusMonitorService {
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(
    private client: Client,
    private lib: LibAPI,
    private apiService: PlanetSideApiService,
  ) {}

  /** Start monitoring for all configured guilds */
  async startAll(): Promise<void> {
    const configs = await PlanetSideConfig.find({
      enabled: true,
      "channels.censusStatus": { $ne: null },
    }).lean();

    for (const config of configs) {
      this.startForGuild(config.guildId);
    }

    log.info(`Census monitor started for ${configs.length} guild(s)`);
  }

  /** Start monitoring for a specific guild */
  startForGuild(guildId: string): void {
    // Clear any existing interval
    this.stopForGuild(guildId);

    // Run immediately, then on interval
    this.poll(guildId).catch((err) => log.error(`Initial poll failed for ${guildId}:`, err));

    const interval = setInterval(() => {
      this.poll(guildId).catch((err) => log.error(`Poll failed for ${guildId}:`, err));
    }, POLL_INTERVAL);

    this.intervals.set(guildId, interval);
  }

  /** Stop monitoring for a specific guild */
  stopForGuild(guildId: string): void {
    const existing = this.intervals.get(guildId);
    if (existing) {
      clearInterval(existing);
      this.intervals.delete(guildId);
    }
  }

  /** Stop all monitors */
  stopAll(): void {
    for (const [guildId, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
    log.info("All census monitors stopped");
  }

  /** Poll both APIs and update status */
  private async poll(guildId: string): Promise<void> {
    const config = await PlanetSideConfig.findOne({ guildId }).lean();
    if (!config?.enabled || !config.channels?.censusStatus) return;

    let status = await CensusStatus.findOne({ guildId });
    if (!status) {
      status = await CensusStatus.create({
        guildId,
        channelId: config.channels.censusStatus,
        census: { online: true, lastChange: Date.now(), consecutiveFailures: 0, consecutiveSuccesses: 0 },
        honu: { online: true, lastChange: Date.now(), consecutiveFailures: 0, consecutiveSuccesses: 0 },
        fisu: { online: true, lastChange: Date.now(), consecutiveFailures: 0, consecutiveSuccesses: 0 },
      });
    }

    // ── Check Honu health ──────────────────────────────────────
    const honuHealth = await this.apiService.getHonuHealth(config.honuBaseUrl);
    if (honuHealth.isHealthy) {
      status.honu.consecutiveSuccesses++;
      status.honu.consecutiveFailures = 0;
      status.honu.lastChecked = new Date();

      if (!status.honu.online && status.honu.consecutiveSuccesses >= THRESHOLD) {
        status.honu.online = true;
        status.honu.lastChange = Date.now();
        log.info(`Honu API back online for guild ${guildId}`);
      }
    } else {
      status.honu.consecutiveFailures++;
      status.honu.consecutiveSuccesses = 0;
      status.honu.lastChecked = new Date();

      if (status.honu.online && status.honu.consecutiveFailures >= THRESHOLD) {
        status.honu.online = false;
        status.honu.lastChange = Date.now();
        log.warn(`Honu API went offline for guild ${guildId}`);
      }
    }

    // ── Check Census health ────────────────────────────────────
    const censusOnline = await this.apiService.testCensusConnection(config.censusServiceId ?? undefined);
    if (censusOnline) {
      status.census.consecutiveSuccesses++;
      status.census.consecutiveFailures = 0;
      status.census.lastChecked = new Date();

      if (!status.census.online && status.census.consecutiveSuccesses >= THRESHOLD) {
        status.census.online = true;
        status.census.lastChange = Date.now();
        log.info(`Census API back online for guild ${guildId}`);
      }
    } else {
      status.census.consecutiveFailures++;
      status.census.consecutiveSuccesses = 0;
      status.census.lastChecked = new Date();

      if (status.census.online && status.census.consecutiveFailures >= THRESHOLD) {
        status.census.online = false;
        status.census.lastChange = Date.now();
        log.warn(`Census API went offline for guild ${guildId}`);
      }
    }

    // ── Check Fisu health ──────────────────────────────────────
    const fisuData = await this.apiService.fisuGetPopulation();
    const fisuOnline = Array.isArray(fisuData) && fisuData.length > 0;
    if (!status.fisu) (status as any).fisu = { online: true, lastChange: Date.now(), consecutiveFailures: 0, consecutiveSuccesses: 0 };
    if (fisuOnline) {
      status.fisu.consecutiveSuccesses++;
      status.fisu.consecutiveFailures = 0;
      status.fisu.lastChecked = new Date();

      if (!status.fisu.online && status.fisu.consecutiveSuccesses >= THRESHOLD) {
        status.fisu.online = true;
        status.fisu.lastChange = Date.now();
        log.info(`Fisu API back online for guild ${guildId}`);
      }
    } else {
      status.fisu.consecutiveFailures++;
      status.fisu.consecutiveSuccesses = 0;
      status.fisu.lastChecked = new Date();

      if (status.fisu.online && status.fisu.consecutiveFailures >= THRESHOLD) {
        status.fisu.online = false;
        status.fisu.lastChange = Date.now();
        log.warn(`Fisu API went offline for guild ${guildId}`);
      }
    }

    await status.save();

    // ── Update status message ──────────────────────────────────
    await this.updateStatusMessage(guildId, config, status);
  }

  /** Create or update the persistent status embed */
  private async updateStatusMessage(guildId: string, config: any, status: any): Promise<void> {
    const channelId = config.channels?.censusStatus;
    if (!channelId) return;

    try {
      let channel = await this.client.channels.fetch(channelId).catch(() => null);

      if (!channel || !channel.isTextBased() || channel.type !== ChannelType.GuildText) {
        log.warn(`Census status channel ${channelId} not found for guild ${guildId}`);
        return;
      }

      const textChannel = channel as TextChannel;

      const honuEmoji = status.honu.online ? "🟢" : status.honu.consecutiveFailures > 0 ? "🟡" : "🔴";
      const censusEmoji = status.census.online ? "🟢" : status.census.consecutiveFailures > 0 ? "🟡" : "🔴";
      const fisuEmoji = status.fisu?.online ? "🟢" : (status.fisu?.consecutiveFailures ?? 0) > 0 ? "🟡" : "🔴";

      const honuStatusText = status.honu.online ? "Online" : status.honu.consecutiveFailures < THRESHOLD ? `Unstable (${status.honu.consecutiveFailures}/${THRESHOLD} failures)` : "Offline";
      const censusStatusText = status.census.online ? "Online" : status.census.consecutiveFailures < THRESHOLD ? `Unstable (${status.census.consecutiveFailures}/${THRESHOLD} failures)` : "Offline";
      const fisuStatusText = status.fisu?.online
        ? "Online"
        : (status.fisu?.consecutiveFailures ?? 0) < THRESHOLD
          ? `Unstable (${status.fisu?.consecutiveFailures ?? 0}/${THRESHOLD} failures)`
          : "Offline";

      const allOnline = status.honu.online && status.census.online && (status.fisu?.online ?? true);
      const allOffline = !status.honu.online && !status.census.online && !(status.fisu?.online ?? true);

      const embed = this.lib
        .createEmbedBuilder()
        .setTitle("🛰️ PlanetSide 2 API Status")
        .setColor(allOnline ? 0x00ff00 : allOffline ? 0xff0000 : 0xffa500)
        .addFields(
          {
            name: `${honuEmoji} Honu API`,
            value:
              `**Status:** ${honuStatusText}\n` +
              `**Last Change:** <t:${Math.floor(status.honu.lastChange / 1000)}:R>\n` +
              (status.honu.lastChecked ? `**Last Checked:** <t:${Math.floor(status.honu.lastChecked.getTime() / 1000)}:R>` : ""),
            inline: true,
          },
          {
            name: `${censusEmoji} Census API`,
            value:
              `**Status:** ${censusStatusText}\n` +
              `**Last Change:** <t:${Math.floor(status.census.lastChange / 1000)}:R>\n` +
              (status.census.lastChecked ? `**Last Checked:** <t:${Math.floor(status.census.lastChecked.getTime() / 1000)}:R>` : ""),
            inline: true,
          },
          {
            name: `${fisuEmoji} Fisu API`,
            value:
              `**Status:** ${fisuStatusText}\n` +
              `**Last Change:** <t:${Math.floor((status.fisu?.lastChange ?? Date.now()) / 1000)}:R>\n` +
              (status.fisu?.lastChecked ? `**Last Checked:** <t:${Math.floor(new Date(status.fisu.lastChecked).getTime() / 1000)}:R>` : ""),
            inline: true,
          },
        )
        .setFooter({ text: `Polling every ${POLL_INTERVAL / 60000} minutes • Threshold: ${THRESHOLD} consecutive pings` })
        .setTimestamp();

      // Linking status
      const linkingAvailable = status.honu.online || status.census.online;
      embed.addFields({
        name: linkingAvailable ? "✅ Account Linking" : "❌ Account Linking",
        value: linkingAvailable ? "Account linking is available." : "Account linking is currently unavailable. Both APIs are offline.",
        inline: false,
      });

      if (status.statusMessageId) {
        try {
          const message = await textChannel.messages.fetch(status.statusMessageId);
          await message.edit({ embeds: [embed] });
          return;
        } catch {
          // Message was deleted, send a new one
        }
      }

      // Send new message
      const message = await textChannel.send({ embeds: [embed] });
      status.statusMessageId = message.id;
      status.channelId = channelId;
      await status.save();
    } catch (error) {
      log.error(`Failed to update status message for guild ${guildId}:`, error);
    }
  }
}
