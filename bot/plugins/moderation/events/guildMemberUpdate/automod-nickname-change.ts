/**
 * guildMemberUpdate → Automod nickname change check
 *
 * Delegates to AutomodEnforcer.handleMemberUpdate() for nickname rule evaluation.
 */

import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModerationPluginAPI } from "../../index.js";

export const event = Events.GuildMemberUpdate;
export const pluginName = "moderation";

export async function execute(
  client: HeimdallClient,
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  // Ignore bots
  if (newMember.user.bot) return;

  // Only run if nickname actually changed
  if (oldMember.nickname === newMember.nickname) return;

  const mod = client.plugins.get("moderation") as ModerationPluginAPI | undefined;
  if (!mod) return;

  await mod.automodEnforcer.handleMemberUpdate(oldMember, newMember);
}
