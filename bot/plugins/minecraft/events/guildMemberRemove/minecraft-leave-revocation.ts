/**
 * Revoke whitelisted players when they leave the Discord server
 */

import { Events, type GuildMember } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { MinecraftLeaveService } from "../../services/MinecraftLeaveService.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("minecraft:leave-revocation");

export const event = Events.GuildMemberRemove;
export const pluginName = "minecraft";

export async function execute(client: HeimdallClient, member: GuildMember): Promise<void> {
  MinecraftLeaveService.revokePlayerOnLeave(member.guild.id, member.id).catch((error: unknown) => {
    log.error(`Failed to revoke on leave for ${member.user.tag}:`, error);
  });
}
