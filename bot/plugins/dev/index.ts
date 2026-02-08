import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";

export const commands = "./commands";
export const api = "./api";

export async function onLoad(context: PluginContext): Promise<PluginAPI> {
  context.logger.debug("Dev plugin loaded");
  return { version: "1.0.0" };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.debug("Dev plugin disabled");
}
