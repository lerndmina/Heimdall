/**
 * FilterUtils — Check if a message passes the guild's role/channel filters
 */

import type { GuildMember, Message } from "discord.js";
import { FilterMode } from "../types/index.js";
import type { VoiceTranscriptionConfigType } from "../models/VoiceTranscriptionConfig.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("vc-transcription");

/**
 * Check if a voice message passes the configured role and channel filters.
 * Both filters must pass (AND logic) for the message to be transcribed.
 */
export function passesFilters(
  message: Message,
  config: VoiceTranscriptionConfigType,
): boolean {
  // Check channel filter
  if (!passesChannelFilter(message.channelId, config.channelFilter)) {
    log.debug(`Message in channel ${message.channelId} blocked by channel filter`);
    return false;
  }

  // Check role filter (need member data)
  const member = message.member;
  if (member && !passesRoleFilter(member, config.roleFilter)) {
    log.debug(`Message from ${message.author.username} blocked by role filter`);
    return false;
  }

  return true;
}

function passesChannelFilter(
  channelId: string,
  filter: { mode: FilterMode; channels: string[] },
): boolean {
  if (filter.mode === FilterMode.DISABLED) return true;

  const isInList = filter.channels.includes(channelId);

  if (filter.mode === FilterMode.WHITELIST) {
    return isInList; // Must be in list
  }

  // Blacklist
  return !isInList; // Must NOT be in list
}

function passesRoleFilter(
  member: GuildMember,
  filter: { mode: FilterMode; roles: string[] },
): boolean {
  if (filter.mode === FilterMode.DISABLED) return true;

  const memberRoles = member.roles.cache.map((r) => r.id);
  const hasMatchingRole = filter.roles.some((roleId) => memberRoles.includes(roleId));

  if (filter.mode === FilterMode.WHITELIST) {
    return hasMatchingRole; // Must have at least one whitelisted role
  }

  // Blacklist
  return !hasMatchingRole; // Must NOT have any blacklisted role
}
