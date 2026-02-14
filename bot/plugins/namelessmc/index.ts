import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

export interface NamelessMcPluginAPI extends PluginAPI {
  version: string;
  lib: LibAPI;
}

export async function onLoad(context: PluginContext): Promise<NamelessMcPluginAPI> {
  const lib = context.dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("namelessmc requires lib plugin");

  context.logger.info("NamelessMC plugin loaded");

  return {
    version: "0.1.0",
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("NamelessMC plugin unloaded");
}

export const commands = "./commands";
