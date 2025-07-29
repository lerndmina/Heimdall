import { Client, ChatInputCommandInteraction, AutocompleteInteraction, RepliableInteraction, Events, REST, Routes } from "discord.js";
import type { HandlerConfig, LoadedCommand, LoadedEvent, UniversalValidation, CommandSpecificValidation, ValidationContext } from "./types";
import { CommandLoader } from "./loaders/CommandLoader";
import { EventLoader } from "./loaders/EventLoader";
import { ValidationLoader } from "./loaders/ValidationLoader";
import { executeValidation, shouldSkipValidation } from "./utils/validation";

export class CommandHandler {
  private client: Client<true>;
  private config: HandlerConfig;

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
  }

  /**
   * Initialize the command handler
   */
  async initialize(): Promise<void> {
    console.log("Initializing CommandHandler...");

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
        console.log("Deferring command registration until bot is logged in");
      }

      console.log("CommandHandler initialized successfully!");
    } catch (error) {
      console.error("Failed to initialize CommandHandler:", error);
      throw error;
    }
  }

  /**
   * Register commands with Discord (call this after bot login)
   */
  async registerCommands(): Promise<void> {
    if (!this.client.user) {
      console.error("Cannot register commands: bot is not logged in");
      return;
    }

    await this.registerSlashCommands();
  }

  /**
   * Load all commands from the commands directory
   */
  private async loadCommands(): Promise<void> {
    console.log("Loading commands...");
    this.commands = await this.commandLoader.loadFromDirectory(this.config.commandsPath);
  }

  /**
   * Load all events from the events directory
   */
  private async loadEvents(): Promise<void> {
    console.log("Loading events...");
    this.events = await this.eventLoader.loadFromDirectory(this.config.eventsPath);
  }

  /**
   * Load all validations from the validations directory
   */
  private async loadValidations(): Promise<void> {
    console.log("Loading validations...");
    const { universal, commandSpecific } = await this.validationLoader.loadValidations(this.config.validationsPath);
    this.universalValidations = universal;
    this.commandValidations = commandSpecific;
  }

  /**
   * Setup Discord event listeners
   */
  private setupEventListeners(): void {
    console.log("Setting up event listeners...");

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
              console.error(`Error in ${eventName} event handler:`, error);
            });
          });
        }
      }
    }

    console.log(`Setup ${this.events.size} event types with ${Array.from(this.events.values()).reduce((sum, arr) => sum + arr.length, 0)} handlers`);
  }

  /**
   * Handle slash command execution
   */
  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      console.warn(`Unknown command: ${interaction.commandName}`);
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
      console.error(`Error executing command ${command.name}:`, error);

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
          console.error("Failed to send error message:", replyError);
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
      console.error(`Error in autocomplete for ${command.name}:`, error);
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

    // 1. Execute universal validations first
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
            console.error("Failed to send validation error message:", error);
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
            console.error("Failed to send validation error message:", error);
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
    console.log("Registering slash commands...");

    if (!process.env.BOT_TOKEN) {
      console.error("BOT_TOKEN environment variable is required for command registration");
      return;
    }

    const rest = new REST().setToken(process.env.BOT_TOKEN);
    const commandData = Array.from(this.commands.values())
      .filter((cmd) => !cmd.config.deleted)
      .map((cmd) => cmd.data.toJSON());

    try {
      if (this.config.devGuildIds && this.config.devGuildIds.length > 0) {
        // Register to development guilds
        for (const guildId of this.config.devGuildIds) {
          await rest.put(Routes.applicationGuildCommands(this.client.user.id, guildId), { body: commandData });
          console.log(`Registered ${commandData.length} commands to development guild ${guildId}`);
        }
      } else {
        // Register globally
        await rest.put(Routes.applicationCommands(this.client.user.id), { body: commandData });
        console.log(`Registered ${commandData.length} commands globally`);
      }
    } catch (error) {
      console.error("Failed to register slash commands:", error);
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
