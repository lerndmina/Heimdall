/**
 * Auto-whitelist players when they rejoin the Discord server
 * (if they were revoked due to leaving)
 */

import { Events, type GuildMember } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { MinecraftLeaveService } from "../../services/MinecraftLeaveService.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("minecraft:auto-whitelist");

export const event = Events.GuildMemberAdd;
export const pluginName = "minecraft";

export async function execute(client: HeimdallClient, member: GuildMember): Promise<void> {
  MinecraftLeaveService.autoWhitelistOnRejoin(member.guild.id, member.id).catch((error: unknown) => {
    log.error(`Failed to auto-whitelist on rejoin for ${member.user.tag}:`, error);
  });
}
