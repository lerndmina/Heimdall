/**
 * UserUpdate event — Log user profile changes (username, avatar, banner)
 */

import { Events, type User, type PartialUser } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { LoggingPluginAPI } from "../../index.js";

export const event = Events.UserUpdate;
export const pluginName = "logging";

export async function execute(client: HeimdallClient, oldUser: User | PartialUser, newUser: User): Promise<void> {
  const pluginAPI = client.plugins.get("logging") as LoggingPluginAPI | undefined;
  if (!pluginAPI) return;

  await pluginAPI.eventService.handleUserUpdate(oldUser, newUser, client);
}
