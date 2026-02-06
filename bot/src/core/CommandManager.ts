/**
 * CommandManager - Collects commands from plugins and registers them to guilds
 *
 * Simplified for personal bot use:
 * - All loaded plugin commands are registered to ALL guilds
 * - No feature gating for command availability
 * - Guild-scoped registration for instant updates during development
 */

import { REST, Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";
import type { HeimdallClient } from "../types/Client";
import type { PluginAPI } from "../types/Plugin";
import log from "../utils/logger";

export interface PluginCommandConfig {
  /** Which plugin owns this command */
  pluginName: string;
  /** Cooldown in seconds */
  cooldown?: number;
}

export interface AutocompleteContext extends Omit<CommandContext, "interaction"> {
  interaction: import("discord.js").AutocompleteInteraction;
}

export interface PluginCommand {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  config: PluginCommandConfig;
  execute: (context: CommandContext) => Promise<void>;
  autocomplete?: (context: AutocompleteContext) => Promise<void>;
}

export interface CommandContext {
  interaction: import("discord.js").ChatInputCommandInteraction;
  client: HeimdallClient;
  /** Get a loaded plugin's API by name */
  getPluginAPI: <T = PluginAPI>(pluginName: string) => T | undefined;
}

export class CommandManager {
  private rest: REST;
  private client: HeimdallClient;
  private commands: Map<string, PluginCommand> = new Map();

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
   * Get command by name
   */
  getCommand(name: string): PluginCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Get all registered commands
   */
  getAllCommands(): Map<string, PluginCommand> {
    return this.commands;
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

    const commandData = Array.from(this.commands.values()).map((cmd) => cmd.data);

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
  getStats(): { total: number } {
    return {
      total: this.commands.size,
    };
  }
}
