import { SlashCommandBuilder, ContextMenuCommandBuilder } from "discord.js";

/**
 * Infers if a command should be guild-only based on its Discord.js builder configuration
 * This checks for DM permissions and contexts to determine where the command can be used
 */
export function isCommandGuildOnly(data: SlashCommandBuilder | ContextMenuCommandBuilder): boolean {
  // For slash commands, check dm_permission
  if (data instanceof SlashCommandBuilder) {
    const json = data.toJSON();
    // If dm_permission is explicitly set to false, it's guild-only
    if (json.dm_permission === false) {
      return true;
    }

    // If contexts are set and don't include private channels, it's guild-only
    if (json.contexts && Array.isArray(json.contexts)) {
      // Context 1 = Bot DM, Context 2 = Private Channel
      const allowsPrivateContexts = json.contexts.includes(1) || json.contexts.includes(2);
      if (!allowsPrivateContexts) {
        return true;
      }
    }

    // Default behavior: if no restrictions are set, allow in DMs (not guild-only)
    return false;
  }

  // For context menu commands, check contexts
  if (data instanceof ContextMenuCommandBuilder) {
    const json = data.toJSON();

    // If contexts are set and don't include private channels, it's guild-only
    if (json.contexts && Array.isArray(json.contexts)) {
      // Context 1 = Bot DM, Context 2 = Private Channel
      const allowsPrivateContexts = json.contexts.includes(1) || json.contexts.includes(2);
      if (!allowsPrivateContexts) {
        return true;
      }
    }

    // Context menu commands are typically guild-only by default in Discord
    // unless explicitly configured otherwise
    return true;
  }

  // Fallback: assume not guild-only
  return false;
}

/**
 * Checks if a command allows DM usage based on its Discord.js builder configuration
 */
export function commandAllowsDM(data: SlashCommandBuilder | ContextMenuCommandBuilder): boolean {
  return !isCommandGuildOnly(data);
}

/**
 * Extracts the allowed contexts from a command builder
 * Returns array of context types: 0=Guild, 1=BotDM, 2=PrivateChannel
 */
export function getCommandContexts(data: SlashCommandBuilder | ContextMenuCommandBuilder): number[] {
  const json = data.toJSON();

  // If contexts are explicitly set, return them
  if (json.contexts && Array.isArray(json.contexts)) {
    return json.contexts;
  }

  // Default contexts based on dm_permission for slash commands
  if (data instanceof SlashCommandBuilder) {
    if (json.dm_permission === false) {
      // Guild only
      return [0];
    }
    // Allow all contexts by default
    return [0, 1, 2];
  }

  // Context menu commands default to guild only
  return [0];
}

/**
 * Checks if a command is configured for user installation
 * User commands are in commands/user/ path and should have UserInstall integration type
 */
export function isUserCommand(filePath: string): boolean {
  // Normalize path separators for cross-platform compatibility
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.includes("/commands/user/");
}

/**
 * Validates if a command has the required integration types for user commands
 * User commands MUST include ApplicationIntegrationType.UserInstall (value: 1)
 */
export function hasUserInstallIntegration(data: SlashCommandBuilder | ContextMenuCommandBuilder): boolean {
  const json = data.toJSON();

  // Check if integration_types includes UserInstall (1)
  if (json.integration_types && Array.isArray(json.integration_types)) {
    return json.integration_types.includes(1);
  }

  // Default: no user install integration
  return false;
}
