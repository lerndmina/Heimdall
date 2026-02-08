/**
 * guildMemberAdd → Automod username check on join
 *
 * Delegates to AutomodEnforcer.handleMemberJoin() for username rule evaluation.
 */

import { Events, type GuildMember } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModerationPluginAPI } from "../../index.js";

export const event = Events.GuildMemberAdd;
export const pluginName = "moderation";

export async function execute(client: HeimdallClient, member: GuildMember): Promise<void> {
  // Ignore bots
  if (member.user.bot) return;

  const mod = client.plugins.get("moderation") as ModerationPluginAPI | undefined;
  if (!mod) return;

  await mod.automodEnforcer.handleMemberJoin(member);
}
