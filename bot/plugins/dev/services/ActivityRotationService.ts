/**
 * ActivityRotationService — Cycles through activity presets on a fixed interval.
 *
 * This is a module-level singleton. Import `activityRotationService` wherever
 * you need to start, stop, or restart rotation.
 */

import { ActivityType } from "discord.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { BotActivityPreset } from "../models/BotActivityModel.js";

const log = createLogger("dev:activity-rotation");

export class ActivityRotationService {
  private timer: NodeJS.Timeout | null = null;
  private currentIndex = 0;

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Start rotating through presets on the given interval.
   * Immediately applies the first preset when called.
   */
  start(client: HeimdallClient, presets: BotActivityPreset[], intervalSeconds: number, status = "online"): void {
    if (presets.length === 0) {
      log.warn("start() called with 0 presets — aborting");
      return;
    }

    this.stop();
    this.currentIndex = 0;

    log.info(`Starting rotation: ${presets.length} preset(s), interval ${intervalSeconds}s`);

    const apply = () => {
      const preset = presets[this.currentIndex % presets.length];
      if (!preset) return;
      applyPreset(client, preset, status);
      this.currentIndex = (this.currentIndex + 1) % presets.length;
    };

    // Apply immediately then schedule
    apply();
    this.timer = setInterval(apply, intervalSeconds * 1000);
  }

  /**
   * Stop rotation. Does not clear the current Discord activity.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info("Rotation stopped");
    }
  }

  /**
   * Stop and restart with new config.
   */
  restart(client: HeimdallClient, presets: BotActivityPreset[], intervalSeconds: number, status: string = "online"): void {
    this.stop();
    this.start(client, presets, intervalSeconds, status);
  }
}

/** Apply a single preset immediately to the client's presence. */
export function applyPreset(client: HeimdallClient, preset: BotActivityPreset, status: string = "online"): void {
  try {
    client.user.setPresence({
      status: status as any,
      activities: [
        preset.type === ActivityType.Custom
          ? { name: "Custom Status", type: ActivityType.Custom, state: preset.text }
          : { name: preset.text, type: preset.type as ActivityType, ...(preset.url ? { url: preset.url } : {}) },
      ],
    });
  } catch (err) {
    log.error("Failed to apply preset:", err);
  }
}

/** Module-level singleton */
export const activityRotationService = new ActivityRotationService();
