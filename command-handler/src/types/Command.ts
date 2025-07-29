import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionResolvable,
  Client,
  RepliableInteraction,
  AutocompleteInteraction,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} from "discord.js";
import type { CommandHandler } from "../CommandHandler";

// Legacy CommandKit compatibility interfaces
export interface LegacyCommandOptions {
  devOnly?: boolean;
  guildOnly?: boolean;
  deleted?: boolean;
  userPermissions?: PermissionResolvable[];
  botPermissions?: PermissionResolvable[];
}

export interface LegacySlashCommandProps {
  interaction: ChatInputCommandInteraction;
  client: Client<true>;
  handler: CommandHandler;
}

export interface LegacyAutocompleteProps {
  interaction: AutocompleteInteraction;
  client: Client<true>;
  handler: CommandHandler;
}

export interface LegacyCommandData {
  data: SlashCommandBuilder;
  options?: LegacyCommandOptions;
  run: (props: LegacySlashCommandProps) => Promise<void> | void;
  autocomplete?: (props: LegacyAutocompleteProps) => Promise<void> | void;
}

// Legacy context menu command support (CommandKit compatibility)
export interface LegacyContextMenuCommandProps {
  interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction;
  client: Client<true>;
  handler: CommandHandler;
}

export interface LegacyContextMenuCommandData {
  data: {
    name: string;
    type: ApplicationCommandType.Message | ApplicationCommandType.User;
  };
  options?: LegacyCommandOptions;
  run: (props: LegacyContextMenuCommandProps) => Promise<void> | void;
}

// Legacy validation interface (exactly like CommandKit)
export interface LegacyValidationProps {
  interaction: RepliableInteraction;
  commandObj: { data: SlashCommandBuilder; options?: LegacyCommandOptions };
  handler: CommandHandler;
}

export type LegacyValidationFunction = (props: LegacyValidationProps) => Promise<boolean> | boolean;

// Modern enhanced types
export interface ModernCommandConfig {
  permissions?: {
    user?: PermissionResolvable[];
    bot?: PermissionResolvable[];
    roles?: string[];
    users?: string[];
  };
  restrictions?: {
    devOnly?: boolean;
    guildOnly?: boolean;
    dmOnly?: boolean;
    ownerOnly?: boolean;
    disabled?: boolean;
  };
  cooldown?: {
    duration: number;
    type: "user" | "guild" | "global";
    bypassRoles?: string[];
    bypassUsers?: string[];
  };
  validations?: {
    skip?: string[]; // Skip specific universal validations
    additional?: string[]; // Additional command-specific validations
  };
}

export interface ModernCommandContext {
  interaction: ChatInputCommandInteraction;
  client: Client<true>;
  handler: CommandHandler;
}

export interface ModernAutocompleteContext {
  interaction: AutocompleteInteraction;
  client: Client<true>;
  handler: CommandHandler;
}

export interface ModernCommandData {
  command: SlashCommandBuilder;
  config?: ModernCommandConfig;
  execute: (ctx: ModernCommandContext) => Promise<void> | void;
  autocomplete?: (ctx: ModernAutocompleteContext) => Promise<void> | void;
}

// Internal unified command representation
export interface LoadedCommand {
  name: string;
  data: SlashCommandBuilder | ContextMenuCommandBuilder;
  filePath: string;
  isLegacy: boolean;
  type: "slash" | "context-menu";

  // Unified configuration
  config: {
    devOnly: boolean;
    guildOnly: boolean;
    deleted: boolean;
    userPermissions: PermissionResolvable[];
    botPermissions: PermissionResolvable[];
    // Enhanced config from modern commands
    restrictions?: ModernCommandConfig["restrictions"];
    cooldown?: ModernCommandConfig["cooldown"];
    validations?: ModernCommandConfig["validations"];
  };

  // Unified execution functions
  execute: (interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction, client: Client<true>, handler: CommandHandler) => Promise<void> | void;
  autocomplete?: (interaction: AutocompleteInteraction, client: Client<true>, handler: CommandHandler) => Promise<void> | void;
}
