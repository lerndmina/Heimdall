/**
 * FilterUtils — Check if a message passes the guild's role/channel filters
 */

import type { GuildMember, Message } from "discord.js";
import { FilterMode } from "../types/index.js";
import type { IVoiceTranscriptionConfig } from "../models/VoiceTranscriptionConfig.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("vc-transcription");

/**
 * Check if a voice message passes the configured role and channel filters.
 * Both filters must pass (AND logic) for the message to be transcribed.
 */
export function passesFilters(
  message: Message,
  config: IVoiceTranscriptionConfig,
): boolean {
  // Check channel filter
  const channelFilter = config.channelFilter ?? { mode: FilterMode.DISABLED, channels: [] };
  if (!passesChannelFilter(message.channelId, channelFilter)) {
    log.debug(`Message in channel ${message.channelId} blocked by channel filter`);
    return false;
  }

  // Check role filter (need member data)
  const roleFilter = config.roleFilter ?? { mode: FilterMode.DISABLED, roles: [] };
  const member = message.member;
  if (member && !passesRoleFilter(member, roleFilter)) {
    log.debug(`Message from ${message.author.username} blocked by role filter`);
    return false;
  }

  return true;
}

function passesChannelFilter(
  channelId: string,
  filter: { mode?: string; channels?: string[] },
): boolean {
  if (!filter.mode || filter.mode === FilterMode.DISABLED) return true;

  const channels = filter.channels ?? [];
  const isInList = channels.includes(channelId);

  if (filter.mode === FilterMode.WHITELIST) {
    return isInList; // Must be in list
  }

  // Blacklist
  return !isInList; // Must NOT be in list
}

function passesRoleFilter(
  member: GuildMember,
  filter: { mode?: string; roles?: string[] },
): boolean {
  if (!filter.mode || filter.mode === FilterMode.DISABLED) return true;

  const roles = filter.roles ?? [];
  const memberRoles = member.roles.cache.map((r) => r.id);
  const hasMatchingRole = roles.some((roleId) => memberRoles.includes(roleId));

  if (filter.mode === FilterMode.WHITELIST) {
    return hasMatchingRole; // Must have at least one whitelisted role
  }

  // Blacklist
  return !hasMatchingRole; // Must NOT have any blacklisted role
}
