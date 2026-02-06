import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";

export const commands = "./commands";

export async function onLoad(context: PluginContext): Promise<PluginAPI> {
  context.logger.info("Dev plugin loaded");
  return { version: "1.0.0" };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("Dev plugin disabled");
}
