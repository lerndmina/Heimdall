import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { HeimdallClient } from "../../src/types/Client.js";
import type { LibAPI } from "../lib/index.js";
import { RoleButtonService } from "./services/RoleButtonService.js";
import "./models/RoleButtonPanel.js";

export interface RoleButtonsPluginAPI extends PluginAPI {
  version: string;
  roleButtonService: RoleButtonService;
  lib: LibAPI;
  client: HeimdallClient;
}

let pluginAPI: RoleButtonsPluginAPI | null = null;

export function getRoleButtonsAPI(): RoleButtonsPluginAPI | null {
  return pluginAPI;
}

export async function onLoad(context: PluginContext): Promise<RoleButtonsPluginAPI> {
  const { dependencies, client } = context;
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("rolebuttons requires lib plugin");

  const roleButtonService = new RoleButtonService();

  lib.componentCallbackService.registerPersistentHandler("rolebuttons.assign", async (interaction) => {
    if (!interaction.isButton()) return;
    const metadata = await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    await roleButtonService.handleRoleAssignment(interaction, metadata as any);
  });

  pluginAPI = {
    version: "1.0.0",
    roleButtonService,
    lib,
    client,
  };

  return pluginAPI;
}

export async function onDisable(_logger: PluginLogger): Promise<void> {
  pluginAPI = null;
}

export const commands = "./commands";
export const events = "./events";
export const api = "./api";
