import type { Client, GuildMember } from "discord.js";
import RoleSyncService from "../../services/RoleSyncService";
import log from "../../utils/log";

export default async (oldMember: GuildMember, newMember: GuildMember, client: Client) => {
  try {
    // Guard against undefined/null members and required properties
    if (
      !oldMember ||
      !newMember ||
      !oldMember.roles ||
      !newMember.roles ||
      !oldMember.guild ||
      !newMember.guild ||
      !newMember.user
    ) {
      log.debug("Skipping role sync - missing member data or properties");
      return;
    }

    // Ensure both members are from the same guild
    if (oldMember.guild.id !== newMember.guild.id) {
      log.debug("Skipping role sync - members from different guilds");
      return;
    }

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
