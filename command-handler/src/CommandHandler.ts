import { Client, ChatInputCommandInteraction, AutocompleteInteraction, RepliableInteraction, Events, REST, Routes, SlashCommandBuilder } from "discord.js";
import type { HandlerConfig, LoadedCommand, LoadedEvent, UniversalValidation, CommandSpecificValidation, ValidationContext } from "./types";
import { CommandLoader } from "./loaders/CommandLoader";
import { EventLoader } from "./loaders/EventLoader";
import { ValidationLoader } from "./loaders/ValidationLoader";
import { executeValidation, shouldSkipValidation } from "./utils/validation";
import { validateCommandOptions } from "./utils/builtinValidations";
import { isCommandGuildOnly } from "./utils/commandUtils";
import { createLogger, LogLevel } from "@heimdall/logger";

// Phase 2: Management Features imports
import { CommandManager } from "./services/CommandManager";
import { ManagementCommands } from "./builtin/ManagementCommands";
import { HelpCommand } from "./builtin/HelpCommand";
import { HotReloadSystem } from "./services/HotReloadSystem";
import { PermissionManager } from "./services/PermissionManager";

export class CommandHandler {
  private client: Client<true>;
  private config: HandlerConfig;
  private logger = createLogger("command-handler", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  // Storage for loaded components
  private commands = new Map<string, LoadedCommand>();
  private events = new Map<string, LoadedEvent[]>();
  private universalValidations = new Map<string, UniversalValidation>();
  private commandValidations = new Map<string, CommandSpecificValidation[]>();

  // Loaders
  private commandLoader = new CommandLoader();
  private eventLoader = new EventLoader();
  private validationLoader = new ValidationLoader();

  // Phase 2: Management Features
  private commandManager?: CommandManager;
  private managementCommands?: ManagementCommands;
  private helpCommand?: HelpCommand;
  private hotReloadSystem?: HotReloadSystem;
  private permissionManager?: PermissionManager;

  constructor(config: HandlerConfig) {
    this.client = config.client;
    this.config = {
      ...config,
      options: {
        autoRegisterCommands: true,
        handleValidationErrors: true,
        logLevel: "info",
        enableHotReload: false,
        ...config.options,
      },
    };

    // Initialize collections
    this.commands = new Map();
    this.events = new Map();
    this.universalValidations = new Map();
    this.commandValidations = new Map();

    // Initialize logger with environment-based configuration
    this.logger = createLogger("command-handler", {
      minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
      enableFileLogging: process.env.LOG_TO_FILE === "true",
    });

    // Phase 2: Initialize management features
    this.initializeManagementFeatures();
  }

  /**
   * Initialize Phase 2 management features
   */
  private initializeManagementFeatures(): void {
    // Initialize Permission Manager
    this.permissionManager = new PermissionManager(this.config.permissions);
    this.logger.debug("Permission manager initialized");

    // Initialize Command Manager
    if (this.config.options?.enableCommandManager !== false) {
      const managementConfig = {
        enabled: false,
        ownerIds: [],
        allowDMs: true,
        allowGuild: true,
        enableHotReload: false,
        enableAnalytics: false,
        ...this.config.management,
      };

      this.commandManager = new CommandManager(this, managementConfig);
      this.logger.debug("Command manager initialized");
    }

    // Initialize Management Commands
    if (this.config.options?.enableManagementCommands && this.config.management?.enabled) {
      const managementConfig = {
        enabled: true,
        ownerIds: [],
        allowDMs: true,
        allowGuild: true,
        enableHotReload: false,
        enableAnalytics: false,
        ...this.config.management,
      };

      this.managementCommands = new ManagementCommands(this, managementConfig);
      this.logger.debug("Management commands initialized");
    }

    // Initialize Help Command (always available)
    this.helpCommand = new HelpCommand(this, this.client);
    this.logger.debug("Help command initialized");

    // Initialize Hot Reload System
    if (this.config.options?.enableHotReload || this.config.hotReload?.enabled) {
      const hotReloadConfig = {
        enabled: true,
        watchMode: "development" as const,
        watchDelay: 500,
        watchIgnorePatterns: ["node_modules", ".git", "dist", "build"],
        enableEventEmission: true,
        enableRollback: true,
        maxReloadAttempts: 3,
        ...this.config.hotReload,
      };

      this.hotReloadSystem = new HotReloadSystem(this, hotReloadConfig);
      this.logger.debug("Hot reload system initialized");

      // Start watching if enabled
      if (hotReloadConfig.enabled) {
        this.hotReloadSystem.startWatching().catch((error) => {
          this.logger.error("Failed to start hot reload watching:", error);
        });
      }
    }
  }

  /**
   * Static factory method to create and initialize CommandHandler
   */
  static async create(config: HandlerConfig): Promise<CommandHandler> {
    const handler = new CommandHandler(config);
    await handler.initialize();
    return handler;
  }

  /**
   * Initialize the command handler
   */
  async initialize(): Promise<void> {
    this.logger.info("Initializing CommandHandler...");

    try {
      // Load all components
      await this.loadCommands();
      await this.loadEvents();
      await this.loadValidations();

      // Setup Discord event listeners
      this.setupEventListeners();

      // Register slash commands
      if (this.config.options?.autoRegisterCommands && this.client.user) {
        await this.registerSlashCommands();
      } else if (this.config.options?.autoRegisterCommands) {
        this.logger.debug("Deferring command registration until bot is logged in");
      }

      this.logger.info("CommandHandler initialized successfully!");
    } catch (error) {
      this.logger.error("Failed to initialize CommandHandler:", error);
      throw error;
    }
  }
  /**
   * Register commands with Discord (call this after bot login)
   */
  async registerCommands(): Promise<void> {
    if (!this.client.user) {
      this.logger.error("Cannot register commands: bot is not logged in");
      return;
    }

    await this.registerSlashCommands();
  }
  /**
   * Load all commands from the commands directory
   */
  private async loadCommands(): Promise<void> {
    this.logger.debug("Loading commands...");
    this.logger.debug(`Loading commands from: ${this.config.commandsPath}`);
    this.commands = await this.commandLoader.loadFromDirectory(this.config.commandsPath);

    // Load built-in management commands if enabled
    if (this.managementCommands && this.config.management?.enabled) {
      this.logger.debug("Loading built-in management commands...");
      const managementCommandList = this.managementCommands.getCommands();

      for (const cmd of managementCommandList) {
        // Convert to LoadedCommand format
        const loadedCommand: LoadedCommand = {
          name: cmd.name,
          data: cmd.data as SlashCommandBuilder,
          filePath: "<built-in>",
          isLegacy: cmd.isLegacy || false,
          type: "slash",
          config: {
            devOnly: cmd.config?.devOnly || false,
            deleted: cmd.config?.deleted || false,
            userPermissions: cmd.config?.userPermissions || [],
            botPermissions: cmd.config?.botPermissions || [],
            category: cmd.category || "management",
          },
          execute: cmd.execute as any,
        };

        this.commands.set(cmd.name, loadedCommand);
        this.logger.debug(`Loaded management command: ${cmd.name}`);
      }
    }

    // Load built-in help command (always available)
    if (this.helpCommand) {
      this.logger.debug("Loading built-in help command...");
      const helpCommandData = this.helpCommand.getHelpCommand();

      this.commands.set(helpCommandData.name, helpCommandData);
      this.logger.debug(`Loaded help command: ${helpCommandData.name}`);
    }

    this.logger.info(`Successfully loaded ${this.commands.size} commands`);

    // Debug: Log command names
    if (this.commands.size > 0) {
      const commandNames = Array.from(this.commands.keys());
      this.logger.debug(`Loaded commands: ${commandNames.join(", ")}`);
    } else {
      this.logger.warn("No commands were loaded!");
    }
  }

  /**
   * Load all events from the events directory
   */
  private async loadEvents(): Promise<void> {
    this.logger.debug("Loading events...");
    this.events = await this.eventLoader.loadFromDirectory(this.config.eventsPath);
    this.logger.info(`Successfully loaded ${Array.from(this.events.values()).reduce((sum, arr) => sum + arr.length, 0)} events across ${this.events.size} event types`);
  }

  /**
   * Load all validations from the validations directory
   */
  private async loadValidations(): Promise<void> {
    this.logger.debug("Loading validations...");
    const { universal, commandSpecific } = await this.validationLoader.loadValidations(this.config.validationsPath);
    this.universalValidations = universal;
    this.commandValidations = commandSpecific;
    this.logger.info(
      `Successfully loaded ${this.universalValidations.size} universal validations and ${Array.from(this.commandValidations.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      )} command-specific validations`
    );
  }

  /**
   * Setup Discord event listeners
   */
  private setupEventListeners(): void {
    this.logger.debug("Setting up event listeners...");

    // Setup command interaction handling
    this.client.on(Events.InteractionCreate, async (interaction: any) => {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isAutocomplete()) {
        await this.handleAutocomplete(interaction);
      } else if (interaction.isContextMenuCommand()) {
        await this.handleContextMenuCommand(interaction);
      }
    });

    // Setup custom events
    for (const [eventName, eventHandlers] of this.events) {
      for (const eventHandler of eventHandlers) {
        if (eventHandler.once) {
          this.client.once(eventName as any, (...args: any[]) => {
            Promise.resolve(eventHandler.execute(this.client, this, ...args)).catch((error: any) => {
              this.logger.error(`Error in ${eventName} event handler:`, error);
            });
          });
        } else {
          this.client.on(eventName as any, (...args: any[]) => {
            Promise.resolve(eventHandler.execute(this.client, this, ...args)).catch((error: any) => {
              this.logger.error(`Error in ${eventName} event handler:`, error);
            });
          });
        }
      }
    }

    this.logger.info(`Setup ${this.events.size} event types with ${Array.from(this.events.values()).reduce((sum, arr) => sum + arr.length, 0)} handlers`);
  }

  /**
   * Handle slash command execution
   */
  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      this.logger.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    // Check if command should be ignored
    if (command.config.deleted) {
      return;
    }

    // Check dev-only restrictions
    if (command.config.devOnly && this.config.devUserIds) {
      if (!this.config.devUserIds.includes(interaction.user.id)) {
        return;
      }
    }

    // Check guild-only restrictions based on command builder settings
    if (isCommandGuildOnly(command.data) && !interaction.guild) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "This command can only be used in servers.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "This command can only be used in servers.",
          ephemeral: true,
        });
      }
      return;
    }

    // Execute the command
    await this.executeCommand(interaction, command);
  }

  /**
   * Execute a command with validation and error handling
   */
  private async executeCommand(interaction: RepliableInteraction, command: LoadedCommand): Promise<void> {
    try {
      // Run validations
      const validationStartTime = Date.now();
      const isValid = await this.executeValidations(interaction, command);
      this.logger.debug(`Validations took ${Date.now() - validationStartTime}ms for command ${command.name}`);

      if (!isValid) {
        this.logger.debug(`Validation failed for command ${command.name}`);
        return;
      }

      // Check permissions
      if (this.permissionManager && command.config.permissions) {
        const permissionContext = {
          userId: interaction.user.id,
          guildId: interaction.guild?.id,
          channelId: interaction.channel?.id || interaction.channelId || "",
          member: interaction.guild?.members.cache.get(interaction.user.id),
          guild: interaction.guild,
          command,
          interaction,
        };

        const permissionResult = await this.permissionManager.checkPermissions(permissionContext, command.config.permissions);

        if (!permissionResult.allowed) {
          this.logger.debug(`Permission denied for command ${command.name}: ${permissionResult.reason}`);

          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: `❌ ${permissionResult.reason}`,
            });
          } else {
            await interaction.reply({
              content: `❌ ${permissionResult.reason}`,
              ephemeral: true,
            });
          }
          return;
        }
      }

      // Execute the command
      const startTime = Date.now();

      if (command.execute) {
        await command.execute(interaction as any, this.client, this);
      }

      const duration = Date.now() - startTime;
      this.logger.debug(`Command ${command.name} executed successfully in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Error executing command ${command.name}:`, error);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ An error occurred while executing this command.",
        });
      } else {
        await interaction.reply({
          content: "❌ An error occurred while executing this command.",
          ephemeral: true,
        });
      }
    }
  }

  /**
   * Handle autocomplete interactions
   */
  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      return;
    }

    try {
      await command.autocomplete(interaction, this.client, this);
    } catch (error) {
      this.logger.error(`Error in autocomplete for ${command.name}:`, error);
    }
  }

  /**
   * Handle context menu command execution
   */
  private async handleContextMenuCommand(interaction: any): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      this.logger.warn(`Unknown context menu command: ${interaction.commandName}`);
      return;
    }

    // Check if command should be ignored
    if (command.config.deleted) {
      return;
    }

    try {
      // Execute validations
      const validationResult = await this.executeValidations(interaction, command);
      if (!validationResult) {
        return;
      }

      this.logger.debug(`Executing context menu command: ${command.name}`);
      await command.execute(interaction, this.client, this);
    } catch (error) {
      this.logger.error(`Error executing context menu command ${command.name}:`, error);

      // Send error message if configured
      if (this.config.options?.handleValidationErrors) {
        const errorMessage = "An error occurred while executing this command.";

        try {
          if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
          } else if (!interaction.replied) {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          }
        } catch (replyError) {
          this.logger.error("Failed to send error message:", replyError);
        }
      }
    }
  }

  /**
   * Execute all validations for a command
   */
  private async executeValidations(interaction: RepliableInteraction, command: LoadedCommand): Promise<boolean> {
    const context: ValidationContext = {
      interaction,
      command,
      handler: this,
    };

    // 0. Execute built-in validations first (CommandOptions validation)
    const builtinResult = await validateCommandOptions(context);
    if (!builtinResult.proceed) {
      if (builtinResult.error && this.config.options?.handleValidationErrors) {
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({
              content: builtinResult.error,
              ephemeral: builtinResult.ephemeral ?? true,
            });
          } else {
            await interaction.reply({
              content: builtinResult.error,
              ephemeral: builtinResult.ephemeral ?? true,
            });
          }
        } catch (error) {
          this.logger.error("Failed to send built-in validation error message:", error);
        }
      }
      return false;
    }

    // 1. Execute universal validations
    for (const [name, validation] of this.universalValidations) {
      // Skip if command config says to skip this validation
      if (shouldSkipValidation(name, command)) {
        continue;
      }

      const result = await executeValidation(validation.execute, context);
      if (!result.proceed) {
        // Validation failed
        if (result.error && this.config.options?.handleValidationErrors) {
          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.followUp({
                content: result.error,
                ephemeral: result.ephemeral ?? true,
              });
            } else {
              await interaction.reply({
                content: result.error,
                ephemeral: result.ephemeral ?? true,
              });
            }
          } catch (error) {
            this.logger.error("Failed to send universal validation error message:", error);
          }
        }
        return false;
      }
    }

    // 2. Execute command-specific validations
    const commandValidations = this.commandValidations.get(command.name) || [];
    for (const validation of commandValidations) {
      const result = await executeValidation(validation.execute, context);
      if (!result.proceed) {
        // Validation failed
        if (result.error && this.config.options?.handleValidationErrors) {
          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.followUp({
                content: result.error,
                ephemeral: result.ephemeral ?? true,
              });
            } else {
              await interaction.reply({
                content: result.error,
                ephemeral: result.ephemeral ?? true,
              });
            }
          } catch (error) {
            this.logger.error("Failed to send command validation error message:", error);
          }
        }
        return false;
      }
    }

    return true; // All validations passed
  }

  /**
   * Register slash commands with Discord
   */
  private async registerSlashCommands(): Promise<void> {
    this.logger.info("Registering commands...");

    if (!process.env.BOT_TOKEN) {
      this.logger.error("BOT_TOKEN environment variable is required for command registration");
      return;
    }

    this.logger.debug(`Total commands loaded: ${this.commands.size}`);

    const rest = new REST().setToken(process.env.BOT_TOKEN);
    const allCommands = Array.from(this.commands.values());
    this.logger.debug(`Commands before filtering: ${allCommands.length}`);

    const nonDeletedCommands = allCommands.filter((cmd) => !cmd.config.deleted);
    this.logger.debug(`Commands after deleted filter: ${nonDeletedCommands.length}`);

    // Separate dev-only commands from regular commands
    const devOnlyCommands = nonDeletedCommands.filter((cmd) => cmd.config.devOnly);
    const globalCommands = nonDeletedCommands.filter((cmd) => !cmd.config.devOnly);

    this.logger.debug(`Dev-only commands: ${devOnlyCommands.length}, Global commands: ${globalCommands.length}`);

    try {
      // Register global commands globally (DM permissions are handled by Discord based on command builder settings)
      if (globalCommands.length > 0) {
        const globalCommandData = globalCommands.map((cmd) => {
          this.logger.debug(`Processing global command ${cmd.name}, type: ${cmd.type}, data: ${typeof cmd.data}`);
          return cmd.data.toJSON();
        });

        const globalSlashCommands = globalCommandData.filter((cmd) => cmd.type === undefined || cmd.type === 1);
        const globalContextMenuCommands = globalCommandData.filter((cmd) => cmd.type === 2 || cmd.type === 3);

        this.logger.info(`Registering ${globalSlashCommands.length} slash commands and ${globalContextMenuCommands.length} context menu commands globally`);

        await rest.put(Routes.applicationCommands(this.client.user.id), { body: globalCommandData });
        this.logger.info(`Registered ${globalCommandData.length} commands globally`);
      }

      // Register dev-only commands to development guilds
      if (devOnlyCommands.length > 0 && this.config.devGuildIds && this.config.devGuildIds.length > 0) {
        const devCommandData = devOnlyCommands.map((cmd) => {
          this.logger.debug(`Processing dev command ${cmd.name}, type: ${cmd.type}, data: ${typeof cmd.data}`);
          return cmd.data.toJSON();
        });

        const devSlashCommands = devCommandData.filter((cmd) => cmd.type === undefined || cmd.type === 1);
        const devContextMenuCommands = devCommandData.filter((cmd) => cmd.type === 2 || cmd.type === 3);

        this.logger.info(`Registering ${devSlashCommands.length} dev slash commands and ${devContextMenuCommands.length} dev context menu commands to development guilds`);

        for (const guildId of this.config.devGuildIds) {
          await rest.put(Routes.applicationGuildCommands(this.client.user.id, guildId), { body: devCommandData });
          this.logger.info(`Registered ${devCommandData.length} dev-only commands to development guild ${guildId}`);
        }
      }
    } catch (error) {
      this.logger.error("Failed to register commands:", error);
    }
  }

  /**
   * Get all loaded events
   */
  getEvents(): Map<string, LoadedEvent[]> {
    return new Map(this.events);
  }

  // Phase 2: Public accessors for management features

  /**
   * Get the command manager instance
   */
  getCommandManager(): CommandManager | undefined {
    return this.commandManager;
  }

  /**
   * Get the management commands instance
   */
  getManagementCommands(): ManagementCommands | undefined {
    return this.managementCommands;
  }

  /**
   * Get the help command instance
   */
  getHelpCommand(): HelpCommand | undefined {
    return this.helpCommand;
  }

  /**
   * Get the hot reload system instance
   */
  getHotReloadSystem(): HotReloadSystem | undefined {
    return this.hotReloadSystem;
  }

  /**
   * Get the permission manager instance
   */
  getPermissionManager(): PermissionManager | undefined {
    return this.permissionManager;
  }

  /**
   * Check service availability
   */
  getInfrastructureStatus(): {
    commandManager: boolean;
    managementCommands: boolean;
    helpCommand: boolean;
    hotReload: boolean;
    permissions: boolean;
  } {
    return {
      commandManager: Boolean(this.commandManager),
      managementCommands: Boolean(this.managementCommands),
      helpCommand: Boolean(this.helpCommand),
      hotReload: Boolean(this.hotReloadSystem),
      permissions: Boolean(this.permissionManager),
    };
  }

  /**
   * Get handler configuration (read-only access)
   */
  getConfig(): Readonly<HandlerConfig> {
    return { ...this.config };
  }

  /**
   * Get commands map (read-only access)
   */
  getCommands(): ReadonlyMap<string, LoadedCommand> {
    return this.commands;
  }

  /**
   * Get a specific command by name
   */
  getCommand(name: string): LoadedCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Set a command (for hot reload system)
   */
  setCommand(name: string, command: LoadedCommand): void {
    this.commands.set(name, command);
  }

  /**
   * Delete a command (for hot reload system)
   */
  deleteCommand(name: string): boolean {
    return this.commands.delete(name);
  }

  /**
   * Get commands path from config
   */
  getCommandsPath(): string {
    return this.config.commandsPath;
  }

  /**
   * Get events path from config
   */
  getEventsPath(): string | undefined {
    return this.config.eventsPath;
  }
}
