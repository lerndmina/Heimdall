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
    const isLegacySlash = this.isLegacySlashPattern(exports);
    const isLegacyContext = this.isLegacyContextMenuPattern(exports);
    const isModern = this.isModernPattern(exports);

    if (isLegacySlash) {
      return this.adaptLegacySlashCommand(exports, filePath, commandName);
    } else if (isLegacyContext) {
      return this.adaptLegacyContextMenuCommand(exports, filePath, commandName);
    } else if (isModern) {
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
      typeof exports.data.toJSON === "function" &&
      !this.isContextMenuCommand(exports.data)
    );
  }

  /**
   * Helper method to detect if data is a context menu command
   */
  private isContextMenuCommand(data: any): boolean {
    // Method 1: instanceof check
    if (data instanceof ContextMenuCommandBuilder) {
      return true;
    }

    // Method 2: Check constructor name
    if (data.constructor?.name === "ContextMenuCommandBuilder") {
      return true;
    }

    // Method 3: Check the toJSON output for context menu structure
    if (typeof data.toJSON === "function") {
      const jsonData = data.toJSON();
      if (jsonData && (jsonData.type === 2 || jsonData.type === 3)) {
        // Message or User context menu
        return true;
      }
    }

    // Method 4: Check for raw object pattern
    if (data.name && data.type && (data.type === 2 || data.type === 3)) {
      return true;
    }

    return false;
  }

  /**
   * Checks if exports match legacy CommandKit context menu command pattern
   */
  private isLegacyContextMenuPattern(exports: any): exports is LegacyContextMenuCommandData {
    // Check for ContextMenuCommandBuilder using more reliable methods
    if (exports.data && typeof exports.run === "function") {
      // Method 1: instanceof check (might fail due to module boundaries)
      if (exports.data instanceof ContextMenuCommandBuilder) {
        return true;
      }

      // Method 2: Check constructor name
      if (exports.data.constructor?.name === "ContextMenuCommandBuilder") {
        return true;
      }

      // Method 3: Check the toJSON output for context menu structure
      if (typeof exports.data.toJSON === "function") {
        const jsonData = exports.data.toJSON();
        if (jsonData && (jsonData.type === 2 || jsonData.type === 3)) {
          // Message or User context menu
          return true;
        }
      }

      // Method 4: Check for raw object pattern
      if (exports.data.name && exports.data.type && (exports.data.type === 2 || exports.data.type === 3)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if exports match modern pattern
   */
  private isModernPattern(exports: any): exports is ModernCommandData {
    // Check for default export modern pattern
    if (exports.default && exports.default.data && typeof exports.default.execute === "function") {
      return true;
    }
    // Check for named export modern pattern
    return exports.data && typeof exports.execute === "function" && !exports.run;
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

    // Handle both ContextMenuCommandBuilder and raw data
    let builder: ContextMenuCommandBuilder;
    let actualCommandName: string;

    if (exports.data instanceof ContextMenuCommandBuilder) {
      builder = exports.data;
      // Get the actual command name from the builder
      actualCommandName = builder.name;
    } else {
      // Convert legacy context menu data to ContextMenuCommandBuilder
      builder = new ContextMenuCommandBuilder().setName(exports.data.name).setType(exports.data.type);
      actualCommandName = exports.data.name;
    }

    return {
      name: actualCommandName, // Use the actual command name, not the filename
      data: builder,
      filePath,
      isLegacy: true,
      type: "context-menu",
      config: {
        devOnly: options.devOnly ?? false,
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
  private adaptModernCommand(exports: ModernCommandData | { default: ModernCommandData }, filePath: string, commandName: string): LoadedCommand {
    // Handle both default export and named export
    const command = "default" in exports ? exports.default : exports;
    const config = command.config || {};

    return {
      name: commandName,
      data: command.data,
      filePath,
      isLegacy: false,
      type: "slash",
      config: {
        // Support both flat config and CommandKit-style options
        devOnly: config.devOnly ?? false,
        deleted: config.deleted ?? false,
        userPermissions: config.userPermissions ?? [],
        botPermissions: config.botPermissions ?? [],
        cooldown: config.cooldown,
        category: config.category,
        nsfw: config.nsfw,
        // Keep advanced config for enhanced features
        advanced: config.advanced,
      },
      execute: async (interaction, client, handler) => {
        await command.execute({ interaction: interaction as any, client, handler });
      },
      autocomplete: command.autocomplete
        ? async (interaction, client, handler) => {
            await command.autocomplete!({ interaction: interaction as any, client, handler });
          }
        : undefined,
    };
  }
}
