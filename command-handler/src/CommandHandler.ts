import { Client, ChatInputCommandInteraction, AutocompleteInteraction, RepliableInteraction, Events, REST, Routes, SlashCommandBuilder } from "discord.js";
import type { HandlerConfig, LoadedCommand, LoadedEvent, UniversalValidation, CommandSpecificValidation, ValidationContext, MiddlewareContext } from "./types";
import { CommandLoader } from "./loaders/CommandLoader";
import { EventLoader } from "./loaders/EventLoader";
import { ValidationLoader } from "./loaders/ValidationLoader";
import { executeValidation, shouldSkipValidation } from "./utils/validation";
import { validateCommandOptions } from "./utils/builtinValidations";
import { isCommandGuildOnly } from "./utils/commandUtils";
import { createLogger, LogLevel } from "@heimdall/logger";

// Phase 1: Core Infrastructure imports
import { ErrorHandler } from "./utils/errorHandling";
import { MiddlewareManager } from "./middleware/MiddlewareManager";
import { PermissionManager } from "./services/PermissionManager";
import { LoggingMiddleware, PostLoggingMiddleware } from "./middleware/builtin/LoggingMiddleware";
import { RateLimitMiddleware } from "./middleware/builtin/RateLimitMiddleware";
import { ErrorCategory } from "./types/Errors";

// Phase 2: Management Features imports
import { CommandManager } from "./services/CommandManager";
import { ManagementCommands } from "./builtin/ManagementCommands";
import { HotReloadSystem } from "./services/HotReloadSystem";
import { AnalyticsCollector } from "./services/AnalyticsCollector";

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

  // Phase 1: Core Infrastructure services
  private errorHandler?: ErrorHandler;
  private middlewareManager?: MiddlewareManager;
  private permissionManager?: PermissionManager;

  // Phase 2: Management Features
  private commandManager?: CommandManager;
  private managementCommands?: ManagementCommands;
  private hotReloadSystem?: HotReloadSystem;
  private analyticsCollector?: AnalyticsCollector;

  constructor(config: HandlerConfig) {
    this.client = config.client;
    this.config = {
      ...config,
      options: {
        autoRegisterCommands: true,
        handleValidationErrors: true,
        logLevel: "info",
        enableHotReload: false,
        enableErrorHandling: true,
        enableMiddleware: true,
        enableAdvancedPermissions: true,
        enableAnalytics: false,
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

    // Phase 1: Initialize core infrastructure services
    this.initializeCoreServices();

    // Phase 2: Initialize management features
    this.initializeManagementFeatures();
  }

  /**
   * Initialize Phase 1 core infrastructure services
   */
  private initializeCoreServices(): void {
    // Initialize Error Handler
    if (this.config.options?.enableErrorHandling !== false) {
      this.errorHandler = new ErrorHandler(this.config.errorHandling);
      this.logger.debug("Error handling service initialized");
    }

    // Initialize Middleware Manager
    if (this.config.options?.enableMiddleware !== false) {
      this.middlewareManager = new MiddlewareManager(this.config.middleware);
      this.setupBuiltinMiddleware();
      this.logger.debug("Middleware service initialized");
    }

    // Initialize Permission Manager
    if (this.config.options?.enableAdvancedPermissions !== false) {
      this.permissionManager = new PermissionManager(this.config.permissions);
      this.logger.debug("Permission service initialized");
    }
  }

  /**
   * Initialize Phase 2 management features
   */
  private initializeManagementFeatures(): void {
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

    // Initialize Analytics Collector
    if (this.config.options?.enableAnalytics || this.config.analytics?.enabled) {
      const analyticsConfig = {
        enabled: true,
        collectUsageStats: true,
        collectPerformanceMetrics: true,
        collectErrorStats: true,
        retentionDays: 30,
        exportFormat: "json" as const,
        enableRealTimeStats: false,
        aggregationInterval: 60,
        ...this.config.analytics,
      };

      this.analyticsCollector = new AnalyticsCollector(this, analyticsConfig);
      this.logger.debug("Analytics collector initialized");
    }
  }

  /**
   * Setup built-in middleware
   */
  private setupBuiltinMiddleware(): void {
    if (!this.middlewareManager) return;

    // Register logging middleware
    const loggingMiddleware = new LoggingMiddleware();
    const postLoggingMiddleware = new PostLoggingMiddleware();
    this.middlewareManager.register(loggingMiddleware);
    this.middlewareManager.register(postLoggingMiddleware);

    // Register rate limiting middleware with default config
    const rateLimitMiddleware = new RateLimitMiddleware({
      windowMs: 60000, // 1 minute
      maxRequests: 10, // 10 requests per minute
      perUser: true,
    });
    this.middlewareManager.register(rateLimitMiddleware);

    this.logger.debug("Built-in middleware registered");
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
              console.error(`Error in ${eventName} event handler:`, error);
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

    // Create execution context for middleware and error handling
    const executionContext = this.createExecutionContext(interaction, command);

    // Execute command with Phase 1 infrastructure
    await this.executeCommandWithInfrastructure(executionContext);
  }

  /**
   * Create execution context for middleware and error handling
   */
  private createExecutionContext(interaction: RepliableInteraction, command: LoadedCommand): MiddlewareContext {
    const member = interaction.guild?.members.cache.get(interaction.user.id);

    return {
      interaction,
      command,
      client: this.client,
      handler: this,
      metadata: new Map(),
      startTime: Date.now(),
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id || interaction.channelId || "",
    };
  }

  /**
   * Execute command with Phase 1 infrastructure (middleware, permissions, error handling)
   */
  private async executeCommandWithInfrastructure(context: MiddlewareContext): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let errorType: string | undefined;

    try {
      // Phase 1: Permission checking
      if (this.config.options?.enableAdvancedPermissions && this.permissionManager) {
        const permissionContext = {
          userId: context.userId,
          guildId: context.guildId,
          channelId: context.channelId,
          memberRoles: context.interaction.guild?.members.cache.get(context.userId)?.roles.cache.map((r) => r.id),
          member: context.interaction.guild?.members.cache.get(context.userId),
          guild: context.interaction.guild || undefined,
          command: context.command,
          interaction: context.interaction,
          timestamp: new Date(),
        };

        const permissionResult = await this.permissionManager.checkPermissions(permissionContext);

        if (!permissionResult.allowed) {
          this.logger.debug(`Permission denied for user ${context.userId} on command ${context.command.name}: ${permissionResult.reason}`);

          // Record analytics for permission denial
          if (this.analyticsCollector) {
            this.analyticsCollector.recordError("PERMISSION_DENIED", permissionResult.reason || "Permission denied", context.command.name, context.userId, context.guildId);
          }

          try {
            if (!context.interaction.replied && !context.interaction.deferred) {
              await context.interaction.reply({
                content: permissionResult.reason || "You don't have permission to use this command.",
                ephemeral: true,
              });
            }
          } catch (error) {
            this.logger.debug("Could not send permission denied message:", error);
          }

          return;
        }
      }

      // Phase 1: Execute pre-middleware
      let shouldContinue = true;
      if (this.config.options?.enableMiddleware && this.middlewareManager) {
        const middlewareStart = Date.now();
        shouldContinue = await this.middlewareManager.executePreMiddleware(context);

        // Record middleware performance
        if (this.analyticsCollector) {
          this.analyticsCollector.recordPerformanceMetric("middleware_execution", `pre-middleware-${context.command.name}`, Date.now() - middlewareStart);
        }

        if (!shouldContinue) {
          this.logger.debug(`Pre-middleware stopped execution for command ${context.command.name}`);
          return;
        }
      }

      // Execute validations (existing validation system)
      const validationStart = Date.now();
      const validationsPassed = await this.executeValidations(context.interaction, context.command);

      // Record validation performance
      if (this.analyticsCollector) {
        this.analyticsCollector.recordPerformanceMetric("validation_execution", `validation-${context.command.name}`, Date.now() - validationStart);
      }

      if (!validationsPassed) {
        // Record analytics for validation failure
        if (this.analyticsCollector) {
          this.analyticsCollector.recordError("VALIDATION_FAILED", "Command validation failed", context.command.name, context.userId, context.guildId);
        }
        return;
      }

      // Execute the actual command
      const commandStart = Date.now();
      await context.command.execute(context.interaction as any, this.client, this);
      const commandDuration = Date.now() - commandStart;

      // Record command performance
      if (this.analyticsCollector) {
        this.analyticsCollector.recordPerformanceMetric("command_execution", context.command.name, commandDuration);
      }

      success = true;

      // Phase 1: Execute post-middleware
      if (this.config.options?.enableMiddleware && this.middlewareManager) {
        const postMiddlewareStart = Date.now();
        await this.middlewareManager.executePostMiddleware(context);

        // Record post-middleware performance
        if (this.analyticsCollector) {
          this.analyticsCollector.recordPerformanceMetric("middleware_execution", `post-middleware-${context.command.name}`, Date.now() - postMiddlewareStart);
        }
      }
    } catch (error) {
      success = false;
      errorType = error instanceof Error ? error.constructor.name : "UNKNOWN_ERROR";

      // Phase 1: Enhanced error handling
      if (this.config.options?.enableErrorHandling && this.errorHandler) {
        const errorContext = {
          commandName: context.command.name,
          userId: context.userId,
          guildId: context.guildId,
          channelId: context.channelId,
          interaction: context.interaction,
          timestamp: new Date(),
          category: ErrorCategory.SYSTEM_ERROR, // Will be determined by error handler
          recoverable: false, // Will be determined by error handler
        };

        const errorResult = await this.errorHandler.handleError(error as Error, errorContext);

        // Record error analytics
        if (this.analyticsCollector) {
          this.analyticsCollector.recordError(
            errorType,
            error instanceof Error ? error.message : "Unknown error",
            context.command.name,
            context.userId,
            context.guildId,
            error instanceof Error ? error.stack : undefined,
            { handled: errorResult.handled, shouldReply: errorResult.shouldReply }
          );
        }

        if (errorResult.shouldReply && errorResult.userMessage) {
          try {
            if (context.interaction.deferred) {
              await context.interaction.editReply({ content: errorResult.userMessage });
            } else if (!context.interaction.replied) {
              await context.interaction.reply({ content: errorResult.userMessage, ephemeral: true });
            } else {
              await context.interaction.followUp({ content: errorResult.userMessage, ephemeral: true });
            }
          } catch (replyError) {
            this.logger.error("Failed to send error message:", replyError);
          }
        }
      } else {
        // Fallback to original error handling
        this.logger.error(`Error executing command ${context.command.name}:`, error);

        // Record error analytics (fallback)
        if (this.analyticsCollector) {
          this.analyticsCollector.recordError(
            errorType,
            error instanceof Error ? error.message : "Unknown error",
            context.command.name,
            context.userId,
            context.guildId,
            error instanceof Error ? error.stack : undefined
          );
        }

        if (this.config.options?.handleValidationErrors) {
          const errorMessage = "An error occurred while executing this command.";

          try {
            if (context.interaction.deferred) {
              await context.interaction.editReply({ content: errorMessage });
            } else if (!context.interaction.replied) {
              await context.interaction.reply({ content: errorMessage, ephemeral: true });
            } else {
              await context.interaction.followUp({ content: errorMessage, ephemeral: true });
            }
          } catch (replyError) {
            this.logger.error("Failed to send error message:", replyError);
          }
        }
      }
    } finally {
      // Record usage analytics
      const totalExecutionTime = Date.now() - startTime;
      if (this.analyticsCollector) {
        this.analyticsCollector.recordCommandUsage(context.command.name, context.userId, context.guildId, totalExecutionTime, success, errorType);
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

  // Phase 1: Public accessors for core infrastructure services

  /**
   * Get the error handler instance
   */
  getErrorHandler(): ErrorHandler | undefined {
    return this.errorHandler;
  }

  /**
   * Get the middleware manager instance
   */
  getMiddlewareManager(): MiddlewareManager | undefined {
    return this.middlewareManager;
  }

  /**
   * Get the permission manager instance
   */
  getPermissionManager(): PermissionManager | undefined {
    return this.permissionManager;
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
   * Get the hot reload system instance
   */
  getHotReloadSystem(): HotReloadSystem | undefined {
    return this.hotReloadSystem;
  }

  /**
   * Get the analytics collector instance
   */
  getAnalyticsCollector(): AnalyticsCollector | undefined {
    return this.analyticsCollector;
  }

  /**
   * Check if Phase 1 services are enabled and available
   */
  getInfrastructureStatus(): {
    errorHandling: boolean;
    middleware: boolean;
    permissions: boolean;
    // Phase 2 status
    commandManager: boolean;
    managementCommands: boolean;
    hotReload: boolean;
    analytics: boolean;
  } {
    return {
      errorHandling: Boolean(this.config.options?.enableErrorHandling !== false && this.errorHandler),
      middleware: Boolean(this.config.options?.enableMiddleware !== false && this.middlewareManager),
      permissions: Boolean(this.config.options?.enableAdvancedPermissions !== false && this.permissionManager),
      // Phase 2 status
      commandManager: Boolean(this.config.options?.enableCommandManager !== false && this.commandManager),
      managementCommands: Boolean(this.config.options?.enableManagementCommands && this.managementCommands),
      hotReload: Boolean(this.config.options?.enableHotReload && this.hotReloadSystem),
      analytics: Boolean(this.config.options?.enableAnalytics && this.analyticsCollector),
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
