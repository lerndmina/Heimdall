/**
 * Helpie Command Types
 *
 * Type definitions for Helpie's command system.
 * Does not rely on Heimdall's command handler - simplified for Helpie's needs.
 */

import { ChatInputCommandInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction, Client, SlashCommandBuilder, ContextMenuCommandBuilder } from "discord.js";

/**
 * Command options (common to all command types)
 */
export interface CommandOptions {
  devOnly?: boolean;
  deleted?: boolean;
}

/**
 * Base command module interface
 */
export interface BaseCommandModule {
  options?: CommandOptions;
}

/**
 * Slash command module (for /helpie subcommands)
 */
export interface SlashCommandModule extends BaseCommandModule {
  data: SlashCommandBuilder;
  run: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
}

/**
 * Context menu command module (Message or User)
 */
export interface ContextMenuCommandModule extends BaseCommandModule {
  data: ContextMenuCommandBuilder;
  run: (interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction, client: Client) => Promise<void>;
}

/**
 * Message context menu command props
 */
export interface MessageContextMenuProps {
  interaction: MessageContextMenuCommandInteraction;
  client: Client;
}

/**
 * User context menu command props
 */
export interface UserContextMenuProps {
  interaction: UserContextMenuCommandInteraction;
  client: Client;
}

/**
 * Union type for any context menu command props
 */
export type ContextMenuProps = MessageContextMenuProps | UserContextMenuProps;

/**
 * Slash command props (for /helpie subcommands)
 */
export interface SlashCommandProps {
  interaction: ChatInputCommandInteraction;
  client: Client;
}
