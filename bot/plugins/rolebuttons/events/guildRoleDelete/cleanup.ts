import { Events, type Role } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { createLogger } from "../../../../src/core/Logger.js";
import { getRoleButtonsAPI } from "../../index.js";

const log = createLogger("rolebuttons:role-delete");

export const event = Events.GuildRoleDelete;
export const pluginName = "rolebuttons";

export async function execute(client: HeimdallClient, role: Role): Promise<void> {
  const api = getRoleButtonsAPI();
  if (!api) return;

  const result = await api.roleButtonService.cleanupDeletedRole(role.guild.id, role.id, client, api.lib);
  if (result.affectedPanels > 0) {
    log.info(`Role deletion cleanup removed references from ${result.affectedPanels} role panel(s) in guild ${role.guild.id}`);
  }
}
