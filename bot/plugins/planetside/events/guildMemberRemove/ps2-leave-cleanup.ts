/**
 * Revoke PS2 linked accounts when a member leaves the Discord server
 */

import { Events, type GuildMember } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { PlanetSideLeaveService } from "../../services/PlanetSideLeaveService.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("planetside:leave-cleanup");

export const event = Events.GuildMemberRemove;
export const pluginName = "planetside";

export async function execute(client: HeimdallClient, member: GuildMember): Promise<void> {
  PlanetSideLeaveService.revokeOnLeave(member.guild.id, member.id).catch((error: unknown) => {
    log.error(`Failed to revoke PS2 link on leave for ${member.user.tag}:`, error);
  });
}
