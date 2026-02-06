/**
 * guildMemberAdd event — Send welcome message to new members
 */

import { Events, type GuildMember } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { createLogger } from "../../../../src/core/Logger.js";
import type { WelcomePluginAPI } from "../../index.js";

const log = createLogger("welcome:event");

export const event = Events.GuildMemberAdd;
export const pluginName = "welcome";

export async function execute(client: HeimdallClient, member: GuildMember): Promise<void> {
  try {
    const pluginAPI = client.plugins.get("welcome") as WelcomePluginAPI | undefined;
    if (!pluginAPI) return;

    const config = await pluginAPI.welcomeService.getConfig(member.guild.id);
    if (!config) {
      log.debug(`No welcome message configured for guild ${member.guild.id}`);
      return;
    }

    const result = await pluginAPI.welcomeService.sendWelcomeMessage(config, member);

    if (!result.success) {
      log.error(`Failed to send welcome message for ${member.user.username}: ${result.error}`);
    }
  } catch (error) {
    log.error("Error in welcome event:", error);
  }
}
