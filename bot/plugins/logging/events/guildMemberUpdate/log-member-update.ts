/**
 * GuildMemberUpdate event — Log member changes (nickname, roles, timeouts)
 */

import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { LoggingPluginAPI } from "../../index.js";

export const event = Events.GuildMemberUpdate;
export const pluginName = "logging";

export async function execute(client: HeimdallClient, oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
  const pluginAPI = client.plugins.get("logging") as LoggingPluginAPI | undefined;
  if (!pluginAPI) return;

  await pluginAPI.eventService.handleGuildMemberUpdate(oldMember, newMember);
}
