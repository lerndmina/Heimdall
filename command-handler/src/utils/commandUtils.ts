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
