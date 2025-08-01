import type { ManagementConfig, CommandMetadata, CommandFilters, ReloadResult, CommandListResult, RegistrationResult } from "../types/Management";
import type { LoadedCommand } from "../types/Command";
import type { CommandHandler } from "../CommandHandler";
import { createLogger, LogLevel } from "@heimdall/logger";
import { pathToName } from "../utils/pathUtils";
import { safeImport } from "../utils/fileUtils";
import { isCommandGuildOnly } from "../utils/commandUtils";
import path from "path";
import fs from "fs/promises";

export class CommandManager {
  private logger = createLogger("command-handler-management", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  private handler: CommandHandler;
  private config: ManagementConfig;
  private disabledCommands = new Set<string>();
  private commandMetadata = new Map<string, CommandMetadata>();

  constructor(handler: CommandHandler, config: ManagementConfig) {
    this.handler = handler;
    this.config = config;
    this.logger.debug("CommandManager initialized with config:", config);
  }

  /**
   * Reload a specific command or all commands
   */
  async reloadCommand(commandName?: string): Promise<ReloadResult[]> {
    const startTime = Date.now();

    if (commandName) {
      const result = await this.reloadSingleCommand(commandName);
      return [result];
    } else {
      return await this.reloadAllCommands();
    }
  }

  /**
   * Reload a single command
   */
  private async reloadSingleCommand(commandName: string): Promise<ReloadResult> {
    const startTime = Date.now();

    try {
      const commands = this.handler.getCommands();
      const existingCommand = commands.get(commandName);

      if (!existingCommand) {
        return {
          success: false,
          commandName,
          error: `Command '${commandName}' not found`,
          reloadTime: Date.now() - startTime,
        };
      }

      // Get the file path for this command
      const filePath = this.getCommandFilePath(commandName);
      if (!filePath) {
        return {
          success: false,
          commandName,
          error: `Could not determine file path for command '${commandName}'`,
          reloadTime: Date.now() - startTime,
        };
      }

      // Invalidate module cache
      this.invalidateModuleCache(filePath);

      // Reload the command
      const commandLoader = (this.handler as any).commandLoader;
      const newCommand = await commandLoader.loadCommand(filePath, this.getCommandsPath());

      if (!newCommand) {
        return {
          success: false,
          commandName,
          error: `Failed to reload command from ${filePath}`,
          reloadTime: Date.now() - startTime,
        };
      }

      // Update the command in the handler
      (this.handler as any).commands.set(commandName, newCommand);

      // Update metadata
      this.updateCommandMetadata(commandName, newCommand);

      this.logger.info(`Successfully reloaded command: ${commandName}`);

      return {
        success: true,
        commandName,
        previousVersion: existingCommand,
        newVersion: newCommand,
        reloadTime: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Error reloading command ${commandName}:`, error);

      return {
        success: false,
        commandName,
        error: error instanceof Error ? error.message : String(error),
        reloadTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Reload all commands
   */
  private async reloadAllCommands(): Promise<ReloadResult[]> {
    const results: ReloadResult[] = [];
    const commands = this.handler.getCommands();

    this.logger.info(`Reloading ${commands.size} commands...`);

    for (const [commandName] of commands) {
      const result = await this.reloadSingleCommand(commandName);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    this.logger.info(`Reload complete: ${successCount} succeeded, ${failureCount} failed`);

    return results;
  }

  /**
   * Disable a command temporarily
   */
  async disableCommand(commandName: string): Promise<boolean> {
    const commands = this.handler.getCommands();

    if (!commands.has(commandName)) {
      this.logger.warn(`Cannot disable command '${commandName}': command not found`);
      return false;
    }

    this.disabledCommands.add(commandName);

    // Update metadata
    const metadata = this.commandMetadata.get(commandName);
    if (metadata) {
      metadata.enabled = false;
    }

    this.logger.info(`Disabled command: ${commandName}`);
    return true;
  }

  /**
   * Enable a previously disabled command
   */
  async enableCommand(commandName: string): Promise<boolean> {
    const commands = this.handler.getCommands();

    if (!commands.has(commandName)) {
      this.logger.warn(`Cannot enable command '${commandName}': command not found`);
      return false;
    }

    this.disabledCommands.delete(commandName);

    // Update metadata
    const metadata = this.commandMetadata.get(commandName);
    if (metadata) {
      metadata.enabled = true;
    }

    this.logger.info(`Enabled command: ${commandName}`);
    return true;
  }

  /**
   * Get detailed information about a command
   */
  getCommandInfo(commandName: string): CommandMetadata | null {
    const commands = this.handler.getCommands();
    const command = commands.get(commandName);

    if (!command) {
      return null;
    }

    // Get or create metadata
    let metadata = this.commandMetadata.get(commandName);
    if (!metadata) {
      metadata = this.createCommandMetadata(commandName, command);
      this.commandMetadata.set(commandName, metadata);
    }

    return { ...metadata };
  }

  /**
   * List commands with optional filters
   */
  listCommands(filters?: CommandFilters): CommandListResult {
    const commands = this.handler.getCommands();
    const allCommands: CommandMetadata[] = [];
    const categories = new Set<string>();

    // Convert all commands to metadata
    for (const [commandName, command] of commands) {
      const metadata = this.getCommandInfo(commandName);
      if (metadata) {
        allCommands.push(metadata);
        categories.add(metadata.category);
      }
    }

    // Apply filters
    let filteredCommands = allCommands;

    if (filters?.category) {
      filteredCommands = filteredCommands.filter((cmd) => cmd.category.toLowerCase().includes(filters.category!.toLowerCase()));
    }

    if (filters?.status) {
      switch (filters.status) {
        case "enabled":
          filteredCommands = filteredCommands.filter((cmd) => cmd.enabled);
          break;
        case "disabled":
          filteredCommands = filteredCommands.filter((cmd) => !cmd.enabled);
          break;
        case "dev-only":
          filteredCommands = filteredCommands.filter((cmd) => cmd.isDevOnly);
          break;
        case "all":
        default:
          // No additional filtering
          break;
      }
    }

    if (filters?.searchTerm) {
      const searchTerm = filters.searchTerm.toLowerCase();
      filteredCommands = filteredCommands.filter(
        (cmd) => cmd.name.toLowerCase().includes(searchTerm) || cmd.description?.toLowerCase().includes(searchTerm) || cmd.category.toLowerCase().includes(searchTerm)
      );
    }

    return {
      commands: filteredCommands,
      totalCount: allCommands.length,
      filteredCount: filteredCommands.length,
      categories: Array.from(categories).sort(),
    };
  }

  /**
   * Force refresh global command registration
   */
  async refreshGlobalCommands(): Promise<RegistrationResult> {
    try {
      this.logger.info("Refreshing global command registration...");

      // Call the handler's registration method
      await this.handler.registerCommands();

      const commandCount = this.handler.getCommands().size;

      this.logger.info(`Successfully refreshed ${commandCount} global commands`);

      return {
        success: true,
        registeredCount: commandCount,
        errors: [],
        isGlobal: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to refresh global commands:", error);

      return {
        success: false,
        registeredCount: 0,
        errors: [errorMessage],
        isGlobal: true,
      };
    }
  }

  /**
   * Force refresh guild-specific command registration
   */
  async refreshGuildCommands(guildId?: string): Promise<RegistrationResult> {
    try {
      if (!guildId) {
        return {
          success: false,
          registeredCount: 0,
          errors: ["Guild ID is required for guild-specific command refresh"],
          isGlobal: false,
        };
      }

      this.logger.info(`Refreshing guild commands for guild: ${guildId}`);

      // This would need to be implemented in the main CommandHandler
      // For now, we'll call the general registration method
      await this.handler.registerCommands();

      const commandCount = this.handler.getCommands().size;

      this.logger.info(`Successfully refreshed ${commandCount} commands for guild ${guildId}`);

      return {
        success: true,
        registeredCount: commandCount,
        errors: [],
        guildId,
        isGlobal: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to refresh guild commands for ${guildId}:`, error);

      return {
        success: false,
        registeredCount: 0,
        errors: [errorMessage],
        guildId,
        isGlobal: false,
      };
    }
  }

  /**
   * Check if a command is disabled
   */
  isCommandDisabled(commandName: string): boolean {
    return this.disabledCommands.has(commandName);
  }

  /**
   * Get commands path from handler config
   */
  private getCommandsPath(): string {
    return (this.handler as any).config.commandsPath;
  }

  /**
   * Get file path for a command (simplified - would need more sophisticated logic)
   */
  private getCommandFilePath(commandName: string): string | null {
    // This is a simplified implementation
    // In a real implementation, you'd want to track file paths when commands are loaded
    const commandsPath = this.getCommandsPath();

    // Try common patterns
    const possiblePaths = [
      path.join(commandsPath, `${commandName}.ts`),
      path.join(commandsPath, `${commandName}.js`),
      path.join(commandsPath, commandName, "index.ts"),
      path.join(commandsPath, commandName, "index.js"),
    ];

    // This would need actual file system checking in a real implementation
    // For now, return the first possibility
    return possiblePaths[0];
  }

  /**
   * Invalidate module from cache
   */
  private invalidateModuleCache(filePath: string): void {
    try {
      const resolved = require.resolve(filePath);
      delete require.cache[resolved];
      this.logger.debug(`Invalidated module cache for: ${filePath}`);
    } catch (error) {
      this.logger.debug(`Could not invalidate cache for ${filePath}:`, error);
    }
  }

  /**
   * Create metadata for a command
   */
  private createCommandMetadata(commandName: string, command: LoadedCommand): CommandMetadata {
    return {
      name: commandName,
      category: this.detectCommandCategory(commandName, command),
      enabled: !this.disabledCommands.has(commandName),
      isDevOnly: command.config.devOnly || false,
      guildOnly: isCommandGuildOnly(command.data),
      executionCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      description: this.getCommandDescription(command),
      filePath: this.getCommandFilePath(commandName) || undefined,
    };
  }

  /**
   * Update metadata for a command
   */
  private updateCommandMetadata(commandName: string, command: LoadedCommand): void {
    let metadata = this.commandMetadata.get(commandName);
    if (!metadata) {
      metadata = this.createCommandMetadata(commandName, command);
    } else {
      // Update fields that might have changed
      metadata.lastReloaded = new Date();
      metadata.description = this.getCommandDescription(command);
      metadata.isDevOnly = command.config.devOnly || false;
      metadata.guildOnly = isCommandGuildOnly(command.data);
    }

    this.commandMetadata.set(commandName, metadata);
  }

  /**
   * Detect command category from command data or file path
   */
  private detectCommandCategory(commandName: string, command: LoadedCommand): string {
    // Try to get category from command data if available
    if ((command as any).category) {
      return (command as any).category;
    }

    // Try to detect from file path structure
    const filePath = this.getCommandFilePath(commandName);
    if (filePath) {
      const commandsPath = this.getCommandsPath();
      const relativePath = path.relative(commandsPath, filePath);
      const pathParts = relativePath.split(path.sep);

      if (pathParts.length > 1) {
        return pathParts[0]; // First directory is category
      }
    }

    return "general";
  }

  /**
   * Get command description from command data
   */
  private getCommandDescription(command: LoadedCommand): string {
    if (command.data && typeof command.data.toJSON === "function") {
      const json = command.data.toJSON();
      // Type check for slash commands which have description
      if ("description" in json) {
        return json.description || "No description available";
      }
    }

    return "No description available";
  }

  /**
   * Get management statistics
   */
  getManagementStats(): {
    totalCommands: number;
    enabledCommands: number;
    disabledCommands: number;
    devOnlyCommands: number;
    categories: string[];
  } {
    const commands = this.listCommands();

    return {
      totalCommands: commands.totalCount,
      enabledCommands: commands.commands.filter((c) => c.enabled).length,
      disabledCommands: commands.commands.filter((c) => !c.enabled).length,
      devOnlyCommands: commands.commands.filter((c) => c.isDevOnly).length,
      categories: commands.categories,
    };
  }
}
