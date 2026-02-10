/**
 * CommandManager - Collects commands from plugins and registers them to guilds
 *
 * Simplified for personal bot use:
 * - All loaded plugin commands are registered to ALL guilds
 * - No feature gating for command availability
 * - Guild-scoped registration for instant updates during development
 */

import {
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type RESTPostAPIContextMenuApplicationCommandsJSONBody,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from "discord.js";
import type { HeimdallClient } from "../types/Client";
import type { PluginAPI } from "../types/Plugin";
import log from "../utils/logger";

export interface PluginCommandConfig {
  /** Which plugin owns this command */
  pluginName: string;
  /** Cooldown in seconds */
  cooldown?: number;
}

export interface CommandPermissionDefinition {
  label?: string;
  description?: string;
  defaultAllow?: boolean;
  subcommands?: Record<string, { label?: string; description?: string; defaultAllow?: boolean }>;
}

export interface CommandPermissionKeys {
  base?: string;
  subcommands: Record<string, string>;
}

export interface AutocompleteContext extends Omit<CommandContext, "interaction"> {
  interaction: import("discord.js").AutocompleteInteraction;
}

export interface PluginCommand {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  config: PluginCommandConfig;
  execute: (context: CommandContext) => Promise<void>;
  autocomplete?: (context: AutocompleteContext) => Promise<void>;
  permissionKeys?: CommandPermissionKeys;
}

export interface PluginContextMenuCommand {
  data: RESTPostAPIContextMenuApplicationCommandsJSONBody;
  config: PluginCommandConfig;
  execute: (context: ContextMenuCommandContext) => Promise<void>;
  permissionKey?: string;
}

export interface CommandContext {
  interaction: import("discord.js").ChatInputCommandInteraction;
  client: HeimdallClient;
  /** Get a loaded plugin's API by name */
  getPluginAPI: <T = PluginAPI>(pluginName: string) => T | undefined;
}

export interface ContextMenuCommandContext {
  interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction;
  client: HeimdallClient;
  /** Get a loaded plugin's API by name */
  getPluginAPI: <T = PluginAPI>(pluginName: string) => T | undefined;
}

/** Provider that returns additional per-guild command data */
export type GuildCommandProvider = (guildId: string) => Promise<RESTPostAPIChatInputApplicationCommandsJSONBody[]>;

/** Resolver that returns a handler for dynamically registered commands */
export type DynamicCommandResolver = (commandName: string, guildId: string | null) => Promise<((context: CommandContext) => Promise<void>) | null>;
export type DynamicPermissionResolver = (commandName: string, guildId: string | null) => Promise<string | null>;

export class CommandManager {
  private rest: REST;
  private client: HeimdallClient;
  private commands: Map<string, PluginCommand> = new Map();
  private contextMenuCommands: Map<string, PluginContextMenuCommand> = new Map();
  private guildCommandProviders: GuildCommandProvider[] = [];
  private dynamicCommandResolvers: DynamicCommandResolver[] = [];
  private dynamicPermissionResolvers: DynamicPermissionResolver[] = [];

  constructor(client: HeimdallClient, botToken: string) {
    this.client = client;
    this.rest = new REST({ version: "10" }).setToken(botToken);
  }

  /**
   * Register a command from a plugin
   */
  registerCommand(command: PluginCommand): void {
    const name = command.data.name;
    if (this.commands.has(name)) {
      log.warn(`Command "${name}" already registered, overwriting`);
    }
    this.commands.set(name, command);
    log.debug(`Registered command: ${name} (plugin: ${command.config.pluginName})`);
  }

  /**
   * Register a context menu command from a plugin
   */
  registerContextMenuCommand(command: PluginContextMenuCommand): void {
    const name = command.data.name;
    if (this.contextMenuCommands.has(name)) {
      log.warn(`Context menu command "${name}" already registered, overwriting`);
    }
    this.contextMenuCommands.set(name, command);
    log.debug(`Registered context menu command: ${name} (plugin: ${command.config.pluginName})`);
  }

  /**
   * Get command by name
   */
  getCommand(name: string): PluginCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Get context menu command by name
   */
  getContextMenuCommand(name: string): PluginContextMenuCommand | undefined {
    return this.contextMenuCommands.get(name);
  }

  /**
   * Get all registered commands
   */
  getAllCommands(): Map<string, PluginCommand> {
    return this.commands;
  }

  /**
   * Get all registered context menu commands
   */
  getAllContextMenuCommands(): Map<string, PluginContextMenuCommand> {
    return this.contextMenuCommands;
  }

  /**
   * Register a provider that contributes per-guild dynamic commands.
   * Providers are called during registerCommandsToGuild() and their
   * commands are included in the PUT body alongside static commands.
   */
  registerGuildCommandProvider(provider: GuildCommandProvider): void {
    this.guildCommandProviders.push(provider);
  }

  /**
   * Register a resolver for dynamically registered commands.
   * When a command is not found in the static command map, resolvers
   * are tried in order. The first to return a handler wins.
   */
  registerDynamicCommandResolver(resolver: DynamicCommandResolver): void {
    this.dynamicCommandResolvers.push(resolver);
  }

  /**
   * Register a resolver for dynamically registered command permissions.
   */
  registerDynamicPermissionResolver(resolver: DynamicPermissionResolver): void {
    this.dynamicPermissionResolvers.push(resolver);
  }

  /**
   * Attempt to resolve a dynamic command handler.
   * Returns null if no resolver can handle the command.
   */
  async resolveDynamicCommand(commandName: string, guildId: string | null): Promise<((context: CommandContext) => Promise<void>) | null> {
    for (const resolver of this.dynamicCommandResolvers) {
      try {
        const handler = await resolver(commandName, guildId);
        if (handler) return handler;
      } catch (error) {
        log.error(`Dynamic command resolver failed for "${commandName}":`, error);
      }
    }
    return null;
  }

  /**
   * Resolve a dynamic command permission key.
   */
  async resolveDynamicPermissionKey(commandName: string, guildId: string | null): Promise<string | null> {
    for (const resolver of this.dynamicPermissionResolvers) {
      try {
        const key = await resolver(commandName, guildId);
        if (key) return key;
      } catch (error) {
        log.error(`Dynamic permission resolver failed for "${commandName}":`, error);
      }
    }
    return null;
  }

  getCommandPermissionKey(commandName: string, subcommandPath?: string | null): string | null {
    const command = this.commands.get(commandName);
    if (!command?.permissionKeys) return null;

    if (subcommandPath) {
      const key = command.permissionKeys.subcommands[subcommandPath];
      if (key) return key;
    }

    return command.permissionKeys.base ?? null;
  }

  getContextMenuPermissionKey(commandName: string): string | null {
    const command = this.contextMenuCommands.get(commandName);
    return command?.permissionKey ?? null;
  }

  /**
   * Register global commands - SKIPPED (using guild-scoped for instant updates)
   * @deprecated Use registerAllCommandsToGuilds() instead
   */
  async registerGlobalCommands(): Promise<void> {
    log.info("Global command registration skipped (using guild-scoped registration)");
  }

  /**
   * Register ALL commands to a specific guild
   */
  async registerCommandsToGuild(guildId: string): Promise<void> {
    const clientId = this.client.user?.id;
    if (!clientId) {
      throw new Error("Client not ready - cannot register guild commands");
    }

    const commandData: (RESTPostAPIChatInputApplicationCommandsJSONBody | RESTPostAPIContextMenuApplicationCommandsJSONBody)[] = [
      ...Array.from(this.commands.values()).map((cmd) => cmd.data),
      ...Array.from(this.contextMenuCommands.values()).map((cmd) => cmd.data),
    ];

    // Add per-guild dynamic commands from providers
    for (const provider of this.guildCommandProviders) {
      try {
        const dynamicCommands = await provider(guildId);
        commandData.push(...dynamicCommands);
      } catch (error) {
        log.error(`Guild command provider failed for guild ${guildId}:`, error);
      }
    }

    if (commandData.length === 0) {
      log.debug(`No commands to register for guild ${guildId}`);
      return;
    }

    try {
      await this.rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandData,
      });

      log.debug(`✅ Registered ${commandData.length} command(s) for guild ${guildId}`);
    } catch (error) {
      log.error(`Failed to register commands for guild ${guildId}:`, error);
      // Don't throw - continue with other guilds
    }
  }

  /**
   * Register ALL commands to ALL guilds
   * This is the main registration method for personal bot use
   */
  async registerAllCommandsToGuilds(): Promise<void> {
    const guilds = this.client.guilds.cache;

    if (guilds.size === 0) {
      log.warn("No guilds to register commands for");
      return;
    }

    const commandCount = this.commands.size;
    if (commandCount === 0) {
      log.warn("No commands to register");
      return;
    }

    log.info(`Registering ${commandCount} command(s) to ${guilds.size} guild(s)...`);

    let successCount = 0;
    let failCount = 0;

    for (const [guildId, guild] of guilds) {
      try {
        await this.registerCommandsToGuild(guildId);
        successCount++;
      } catch (error) {
        failCount++;
        log.error(`Failed to register commands for guild ${guild.name} (${guildId}):`, error);
      }
    }

    log.info(`✅ Command registration complete: ${successCount}/${guilds.size} guilds succeeded`);
    if (failCount > 0) {
      log.warn(`⚠️ ${failCount} guild(s) failed command registration`);
    }
  }

  /**
   * Refresh commands for a guild (alias for registerCommandsToGuild)
   */
  async refreshGuildCommands(guildId: string): Promise<void> {
    log.info(`Refreshing commands for guild ${guildId}...`);
    await this.registerCommandsToGuild(guildId);
  }

  /**
   * Get stats about registered commands
   */
  getStats(): { total: number; slashCommands: number; contextMenuCommands: number } {
    return {
      total: this.commands.size + this.contextMenuCommands.size,
      slashCommands: this.commands.size,
      contextMenuCommands: this.contextMenuCommands.size,
    };
  }
}
