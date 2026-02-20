/**
 * Auto-restore PS2 links when a member rejoins the Discord server
 * (if they were revoked due to leaving)
 */

import { Events, type GuildMember } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { PlanetSideLeaveService } from "../../services/PlanetSideLeaveService.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("planetside:auto-role");

export const event = Events.GuildMemberAdd;
export const pluginName = "planetside";

export async function execute(client: HeimdallClient, member: GuildMember): Promise<void> {
  PlanetSideLeaveService.autoRestoreOnRejoin(member.guild.id, member.id).catch((error: unknown) => {
    log.error(`Failed to auto-restore PS2 link on rejoin for ${member.user.tag}:`, error);
  });
}
