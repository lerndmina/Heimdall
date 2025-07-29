import { Client, ChatInputCommandInteraction, AutocompleteInteraction, RepliableInteraction, Events, REST, Routes } from "discord.js";
import type { HandlerConfig, LoadedCommand, LoadedEvent, UniversalValidation, CommandSpecificValidation, ValidationContext } from "./types";
import { CommandLoader } from "./loaders/CommandLoader";
import { EventLoader } from "./loaders/EventLoader";
import { ValidationLoader } from "./loaders/ValidationLoader";
import { executeValidation, shouldSkipValidation } from "./utils/validation";
import { validateCommandOptions } from "./utils/builtinValidations";
import { createLogger, LogLevel } from "@heimdall/logger";

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

    // Check guild-only restrictions
    if (command.config.guildOnly && !interaction.guild) {
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

    // Execute validations
    const validationsPassed = await this.executeValidations(interaction, command);
    if (!validationsPassed) {
      return; // Validation failed, stop execution
    }

    // Execute the command
    try {
      await command.execute(interaction, this.client, this);
    } catch (error) {
      this.logger.error(`Error executing command ${command.name}:`, error);

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

    const commandData = nonDeletedCommands.map((cmd) => {
      this.logger.debug(`Processing command ${cmd.name}, type: ${cmd.type}, data: ${typeof cmd.data}`);
      return cmd.data.toJSON();
    });

    const slashCommands = commandData.filter((cmd) => cmd.type === undefined || cmd.type === 1);
    const contextMenuCommands = commandData.filter((cmd) => cmd.type === 2 || cmd.type === 3);

    this.logger.info(`Registering ${slashCommands.length} slash commands and ${contextMenuCommands.length} context menu commands`);

    try {
      if (this.config.devGuildIds && this.config.devGuildIds.length > 0) {
        // Register to development guilds
        for (const guildId of this.config.devGuildIds) {
          await rest.put(Routes.applicationGuildCommands(this.client.user.id, guildId), { body: commandData });
          this.logger.info(`Registered ${commandData.length} commands to development guild ${guildId}`);
        }
      } else {
        // Register globally
        await rest.put(Routes.applicationCommands(this.client.user.id), { body: commandData });
        this.logger.info(`Registered ${commandData.length} commands globally`);
      }
    } catch (error) {
      this.logger.error("Failed to register commands:", error);
    }
  }

  /**
   * Get all loaded commands
   */
  getCommands(): Map<string, LoadedCommand> {
    return new Map(this.commands);
  }

  /**
   * Get a specific command
   */
  getCommand(name: string): LoadedCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Get all loaded events
   */
  getEvents(): Map<string, LoadedEvent[]> {
    return new Map(this.events);
  }
}
