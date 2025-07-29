import type { LoadedCommand, LegacyCommandData, LegacyContextMenuCommandData, ModernCommandData, LegacyCommandOptions } from "../types";
import { discoverFiles, safeImport } from "../utils/fileUtils";
import { pathToName } from "../utils/pathUtils";
import { ContextMenuCommandBuilder } from "discord.js";
import { createLogger, LogLevel } from "@heimdall/logger";

export class CommandLoader {
  private logger = createLogger("command-handler", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  /**
   * Loads all commands from the specified directory
   */
  async loadFromDirectory(commandsPath: string): Promise<Map<string, LoadedCommand>> {
    const commands = new Map<string, LoadedCommand>();

    this.logger.debug(`Loading commands from: ${commandsPath}`);

    // Discover all command files recursively
    const files = await discoverFiles(commandsPath, [".ts", ".js"]);
    this.logger.debug(`Found ${files.length} potential command files`);

    for (const file of files) {
      try {
        const command = await this.loadCommand(file, commandsPath);
        if (command) {
          if (commands.has(command.name)) {
            this.logger.warn(`Duplicate command name "${command.name}" found in ${file}. Skipping.`);
            continue;
          }

          commands.set(command.name, command);
          this.logger.debug(`Loaded command: ${command.name} (${command.isLegacy ? "legacy" : "modern"})`);
        }
      } catch (error) {
        this.logger.error(`Failed to load command from ${file}:`, error);
      }
    }

    this.logger.debug(`Successfully loaded ${commands.size} commands`);
    return commands;
  }

  /**
   * Loads a single command file
   */
  private async loadCommand(filePath: string, basePath: string): Promise<LoadedCommand | null> {
    const exports = await safeImport(filePath);
    if (!exports) {
      return null;
    }

    const commandName = pathToName(filePath, basePath);

    // Detect export pattern
    if (this.isLegacySlashPattern(exports)) {
      return this.adaptLegacySlashCommand(exports, filePath, commandName);
    } else if (this.isLegacyContextMenuPattern(exports)) {
      return this.adaptLegacyContextMenuCommand(exports, filePath, commandName);
    } else if (this.isModernPattern(exports)) {
      return this.adaptModernCommand(exports, filePath, commandName);
    } else {
      this.logger.warn(`Invalid command export pattern in ${filePath}`);
      return null;
    }
  }

  /**
   * Checks if exports match legacy CommandKit slash command pattern
   */
  private isLegacySlashPattern(exports: any): exports is LegacyCommandData {
    return (
      exports.data &&
      typeof exports.run === "function" &&
      // Ensure it's a SlashCommandBuilder, not a context menu command
      typeof exports.data.toJSON === "function"
    );
  }

  /**
   * Checks if exports match legacy CommandKit context menu command pattern
   */
  private isLegacyContextMenuPattern(exports: any): exports is LegacyContextMenuCommandData {
    return exports.data && typeof exports.run === "function" && exports.data.name && exports.data.type && (exports.data.type === 2 || exports.data.type === 3); // Message or User context menu
  }

  /**
   * Checks if exports match modern pattern
   */
  private isModernPattern(exports: any): exports is ModernCommandData {
    return exports.command && typeof exports.execute === "function";
  }

  /**
   * Adapts legacy CommandKit slash command to internal format
   */
  private adaptLegacySlashCommand(exports: LegacyCommandData, filePath: string, commandName: string): LoadedCommand {
    const options = exports.options || {};

    return {
      name: commandName,
      data: exports.data,
      filePath,
      isLegacy: true,
      type: "slash",
      config: {
        devOnly: options.devOnly ?? false,
        guildOnly: options.guildOnly ?? false,
        deleted: options.deleted ?? false,
        userPermissions: options.userPermissions ?? [],
        botPermissions: options.botPermissions ?? [],
      },
      execute: async (interaction, client, handler) => {
        await exports.run({ interaction: interaction as any, client, handler });
      },
      autocomplete: exports.autocomplete
        ? async (interaction, client, handler) => {
            await exports.autocomplete!({ interaction: interaction as any, client, handler });
          }
        : undefined,
    };
  }

  /**
   * Adapts legacy CommandKit context menu command to internal format
   */
  private adaptLegacyContextMenuCommand(exports: LegacyContextMenuCommandData, filePath: string, commandName: string): LoadedCommand {
    const options = exports.options || {};

    // Convert legacy context menu data to ContextMenuCommandBuilder
    const builder = new ContextMenuCommandBuilder().setName(exports.data.name).setType(exports.data.type);

    return {
      name: commandName,
      data: builder,
      filePath,
      isLegacy: true,
      type: "context-menu",
      config: {
        devOnly: options.devOnly ?? false,
        guildOnly: options.guildOnly ?? false,
        deleted: options.deleted ?? false,
        userPermissions: options.userPermissions ?? [],
        botPermissions: options.botPermissions ?? [],
      },
      execute: async (interaction, client, handler) => {
        await exports.run({ interaction: interaction as any, client, handler });
      },
    };
  }

  /**
   * Adapts modern command to internal format
   */
  private adaptModernCommand(exports: ModernCommandData, filePath: string, commandName: string): LoadedCommand {
    const config = exports.config || {};

    return {
      name: commandName,
      data: exports.command,
      filePath,
      isLegacy: false,
      type: "slash",
      config: {
        // Map modern config to legacy format for compatibility
        devOnly: config.restrictions?.devOnly ?? false,
        guildOnly: config.restrictions?.guildOnly ?? false,
        deleted: config.restrictions?.disabled ?? false,
        userPermissions: config.permissions?.user ?? [],
        botPermissions: config.permissions?.bot ?? [],
        // Keep modern config for enhanced features
        restrictions: config.restrictions,
        cooldown: config.cooldown,
        validations: config.validations,
      },
      execute: async (interaction, client, handler) => {
        await exports.execute({ interaction: interaction as any, client, handler });
      },
      autocomplete: exports.autocomplete
        ? async (interaction, client, handler) => {
            await exports.autocomplete!({ interaction: interaction as any, client, handler });
          }
        : undefined,
    };
  }
}
