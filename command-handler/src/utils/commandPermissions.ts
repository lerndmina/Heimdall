import { SlashCommandBuilder, ContextMenuCommandBuilder, InteractionContextType } from "discord.js";

/**
 * Determines if a command should be available in DMs based on its builder configuration
 */
export function canRunInDMs(data: SlashCommandBuilder | ContextMenuCommandBuilder): boolean {
  // Check for explicit DM permission setting
  const jsonData = data.toJSON();

  // If dm_permission is explicitly set, use that
  if (typeof jsonData.dm_permission === "boolean") {
    return jsonData.dm_permission;
  }

  // Check contexts if available (newer Discord.js feature)
  if (jsonData.contexts && Array.isArray(jsonData.contexts)) {
    // If contexts are specified, check if DM context is included
    return jsonData.contexts.includes(InteractionContextType.PrivateChannel);
  }

  // Default: commands can run in DMs unless explicitly restricted
  return true;
}

/**
 * Determines if a command should be available in guilds based on its builder configuration
 */
export function canRunInGuilds(data: SlashCommandBuilder | ContextMenuCommandBuilder): boolean {
  const jsonData = data.toJSON();

  // Check contexts if available (newer Discord.js feature)
  if (jsonData.contexts && Array.isArray(jsonData.contexts)) {
    // If contexts are specified, check if any guild contexts are included
    return jsonData.contexts.includes(InteractionContextType.Guild) || jsonData.contexts.includes(InteractionContextType.BotDM);
  }

  // If dm_permission is false, it's implicitly guild-only
  if (jsonData.dm_permission === false) {
    return true;
  }

  // Default: commands can run in guilds
  return true;
}

/**
 * Gets a descriptive string of where the command can run
 */
export function getCommandScope(data: SlashCommandBuilder | ContextMenuCommandBuilder): string {
  const canDM = canRunInDMs(data);
  const canGuild = canRunInGuilds(data);

  if (canDM && canGuild) {
    return "DMs and Guilds";
  } else if (canDM) {
    return "DMs only";
  } else if (canGuild) {
    return "Guilds only";
  } else {
    return "Nowhere (invalid config)";
  }
}
