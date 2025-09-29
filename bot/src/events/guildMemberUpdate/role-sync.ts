import type { Client, GuildMember } from "discord.js";
import type { CommandHandler } from "@heimdall/command-handler";
import RoleSyncService from "../../services/RoleSyncService";
import log from "../../utils/log";

export default async (
  client: Client,
  handler: CommandHandler,
  oldMember: GuildMember,
  newMember: GuildMember
) => {
  try {
    // Check if roles have changed
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Get added and removed roles (excluding @everyone)
    const addedRoles = newRoles.filter(
      (role) => !oldRoles.has(role.id) && role.id !== newMember.guild.id
    );
    const removedRoles = oldRoles.filter(
      (role) => !newRoles.has(role.id) && role.id !== newMember.guild.id
    );

    // If no role changes, return early
    if (addedRoles.size === 0 && removedRoles.size === 0) {
      return;
    }

    log.info(
      `Role change detected for ${newMember.user.username} in ${newMember.guild.name}: +${addedRoles.size} -${removedRoles.size}`
    );

    // Initialize role sync service
    const roleSyncService = new RoleSyncService(client);

    // Handle the role change
    await roleSyncService.handleDiscordRoleChange(
      newMember.guild.id,
      newMember.id,
      addedRoles.map((role) => role.id),
      removedRoles.map((role) => role.id)
    );
  } catch (error) {
    log.error("Error handling guild member role update:", error);
  }
};
