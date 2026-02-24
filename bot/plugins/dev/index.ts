import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import BotActivityModel from "./models/BotActivityModel.js";
import { activityRotationService, applyPreset } from "./services/ActivityRotationService.js";

export const commands = "./commands";
export const api = "./api";

export async function onLoad(context: PluginContext): Promise<PluginAPI> {
  const { client, logger } = context;

  // ── Restore persisted activity/rotation on startup ───────────────────────
  try {
    const config = await BotActivityModel.findById("global").lean();
    if (config) {
      if (config.rotation?.enabled && config.presets.length > 0) {
        logger.info(`Dev: resuming activity rotation (${config.presets.length} presets, every ${config.rotation.intervalSeconds}s)`);
        activityRotationService.start(client, config.presets, config.rotation.intervalSeconds, config.status ?? "online");
      } else if (config.activePresetId) {
        const preset = config.presets.find((p) => p.id === config.activePresetId);
        if (preset) {
          logger.info(`Dev: restoring activity — ${preset.name}`);
          applyPreset(client, preset, config.status ?? "online");
        }
      }
    }
  } catch (err) {
    logger.error("Dev: failed to restore activity config:", err);
  }

  logger.debug("Dev plugin loaded");
  return { version: "1.0.0" };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  activityRotationService.stop();
  logger.debug("Dev plugin disabled");
}
