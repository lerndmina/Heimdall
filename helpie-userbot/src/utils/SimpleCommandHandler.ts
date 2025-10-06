/**
 * Simple Command Loader for Helpie
 *
 * Loads all commands from commands/user/ and converts them into subcommands
 * under /helpie with full argument support.
 * Also handles context menu commands separately.
 */

import {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
  Client,
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} from "discord.js";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import log from "./log";
import { SlashCommandModule, ContextMenuCommandModule } from "../types/commands";

export type CommandModule = SlashCommandModule | ContextMenuCommandModule;

interface GroupedCommand {
  group: string;
  subcommands: Map<string, SlashCommandModule>;
}

interface EventHandler {
  name: string;
  filePath: string;
  execute: (client: Client, ...args: any[]) => Promise<boolean | void>;
}

export class SimpleCommandHandler {
  private commands: Map<string, SlashCommandModule> = new Map();
  private groupedCommands: Map<string, GroupedCommand> = new Map();
  private contextMenuCommands: Map<string, ContextMenuCommandModule> = new Map();
  private events: Map<string, EventHandler[]> = new Map();
  private client: Client;
  private commandsPath: string;
  private eventsPath: string;

  constructor(client: Client, commandsPath: string, eventsPath?: string) {
    this.client = client;
    this.commandsPath = commandsPath;
    this.eventsPath = eventsPath || path.join(path.dirname(commandsPath), "events");
  }

  /**
   * Type guard to check if a command module is a context menu command
   */
  private isContextMenuCommandModule(commandModule: CommandModule): commandModule is ContextMenuCommandModule {
    return this.isContextMenuCommand(commandModule.data);
  }

  /**
   * Type guard to check if a command module is a slash command
   */
  private isSlashCommandModule(commandModule: CommandModule): commandModule is SlashCommandModule {
    return !this.isContextMenuCommand(commandModule.data);
  }

  /**
   * Load all commands from the commands directory
   *
   * File structure:
   * - commands/user/ping.ts → /helpie ping
   * - commands/user/admin/ban.ts → /helpie admin ban
   * - commands/user/admin/kick.ts → /helpie admin kick
   * - commands/user/ask-context.ts → Context menu command (standalone)
   */
  async loadCommands(): Promise<void> {
    log.debug("Loading commands...");
    this.commands.clear();
    this.groupedCommands.clear();
    this.contextMenuCommands.clear();

    const commandFiles = this.findCommandFiles(this.commandsPath);
    let deletedCount = 0;

    for (const filePath of commandFiles) {
      try {
        // Convert file path to file:// URL for ESM compatibility (works on Windows and Linux)
        const fileUrl = pathToFileURL(filePath).href;

        // Clear require cache for hot reload
        delete require.cache[require.resolve(filePath)];

        const commandModule: CommandModule = await import(fileUrl);

        if (!commandModule.data || !commandModule.run) {
          log.debug(`Skipping ${filePath} - missing data or run function`);
          continue;
        }

        // Skip deleted commands (they will be removed from Discord during registration)
        if (commandModule.options?.deleted) {
          deletedCount++;
          log.debug(`Skipping deleted command: ${commandModule.data.name} (marked with deleted: true)`);
          continue;
        }

        // Check if this is a context menu command
        if (this.isContextMenuCommandModule(commandModule)) {
          this.contextMenuCommands.set(commandModule.data.name, commandModule);
          log.debug(`Loaded context menu command: ${commandModule.data.name}`);
          continue;
        }

        // Type guard passed - now we know it's a SlashCommandModule
        if (!this.isSlashCommandModule(commandModule)) {
          // This shouldn't happen but TypeScript needs this check
          continue;
        }

        // Detect if this is a grouped command by checking directory structure
        const relativePath = path.relative(this.commandsPath, filePath);
        const pathParts = relativePath.split(path.sep);

        if (pathParts.length > 1) {
          // This is a grouped command: e.g., admin/ban.ts
          const groupName = pathParts[0];
          const subcommandName = commandModule.data.name;

          if (!this.groupedCommands.has(groupName)) {
            this.groupedCommands.set(groupName, {
              group: groupName,
              subcommands: new Map(),
            });
          }

          this.groupedCommands.get(groupName)!.subcommands.set(subcommandName, commandModule);
          log.debug(`Loaded grouped command: ${groupName} → ${subcommandName}`);
        } else {
          // Regular command
          this.commands.set(commandModule.data.name, commandModule);
          log.debug(`Loaded command: ${commandModule.data.name}`);
        }
      } catch (error) {
        log.error(`Failed to load command from ${filePath}:`, error);
      }
    }

    const totalSubcommands = Array.from(this.groupedCommands.values()).reduce((sum, group) => sum + group.subcommands.size, 0);

    log.info(`Loaded ${this.commands.size} simple commands, ${this.groupedCommands.size} groups with ${totalSubcommands} subcommands, and ${this.contextMenuCommands.size} context menu commands`);
    if (deletedCount > 0) {
      log.info(`Excluded ${deletedCount} deleted commands (will be removed from Discord)`);
    }
  }

  /**
   * Load all events from the events directory
   *
   * Events are organized by folder name (event name) and files are loaded
   * in alphanumeric order (0-9, a-z). Each event handler can return true
   * to stop propagation to subsequent handlers.
   */
  async loadEvents(): Promise<void> {
    log.debug("Loading events...");
    this.events.clear();

    if (!fs.existsSync(this.eventsPath)) {
      log.warn(`Events directory not found: ${this.eventsPath}`);
      return;
    }

    const eventDirs = fs
      .readdirSync(this.eventsPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    let totalHandlers = 0;

    for (const eventName of eventDirs) {
      const eventDir = path.join(this.eventsPath, eventName);
      const eventFiles = fs
        .readdirSync(eventDir, { withFileTypes: true })
        .filter((dirent) => dirent.isFile() && (dirent.name.endsWith(".ts") || dirent.name.endsWith(".js")))
        .map((dirent) => dirent.name)
        .sort(); // Alphabetical order (0-9, a-z)

      for (const fileName of eventFiles) {
        const filePath = path.join(eventDir, fileName);

        try {
          // Convert to file:// URL for cross-platform ESM compatibility
          const fileUrl = pathToFileURL(filePath).href;

          // Clear require cache for hot reload
          delete require.cache[require.resolve(filePath)];

          const eventModule = await import(fileUrl);

          // Support default export (legacy pattern)
          if (typeof eventModule.default === "function") {
            const handler: EventHandler = {
              name: eventName,
              filePath,
              execute: eventModule.default,
            };

            if (!this.events.has(eventName)) {
              this.events.set(eventName, []);
            }

            this.events.get(eventName)!.push(handler);
            totalHandlers++;
            log.debug(`Loaded event handler: ${eventName} from ${fileName}`);
          } else {
            log.warn(`Event file ${filePath} does not export a default function`);
          }
        } catch (error) {
          log.error(`Failed to load event from ${filePath}:`, error);
        }
      }
    }

    log.info(`Loaded ${totalHandlers} event handlers across ${this.events.size} event types`);
  }

  /**
   * Setup event listeners for Discord events
   */
  setupEventListeners(): void {
    log.debug("Setting up event listeners...");

    for (const [eventName, handlers] of this.events) {
      this.client.on(eventName as any, async (...args: any[]) => {
        for (const handler of handlers) {
          try {
            const shouldStop = await handler.execute(this.client, ...args);
            if (shouldStop === true) {
              log.debug(`Event ${eventName} propagation stopped by ${handler.filePath}`);
              break;
            }
          } catch (error) {
            log.error(`Error in ${eventName} event handler (${handler.filePath}):`, error);
          }
        }
      });
    }

    log.info(`Setup ${this.events.size} event types with ${Array.from(this.events.values()).reduce((sum, arr) => sum + arr.length, 0)} handlers`);
  }

  /**
   * Check if a command data object is a context menu command
   * Uses multiple detection methods for reliability
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

    // Method 3: Check the toJSON output for context menu type
    if (typeof data.toJSON === "function") {
      try {
        const jsonData = data.toJSON();
        if (jsonData && (jsonData.type === 2 || jsonData.type === 3)) {
          // Type 2 = Message, Type 3 = User context menu
          return true;
        }
      } catch (error) {
        // Ignore toJSON errors
      }
    }

    // Method 4: Check for raw object pattern
    if (data.name && data.type && (data.type === 2 || data.type === 3 || data.type === ApplicationCommandType.Message || data.type === ApplicationCommandType.User)) {
      return true;
    }

    return false;
  }
  /**
   * Build the /helpie command with all subcommands
   */
  buildHelpieCommand(): any {
    const command = new SlashCommandBuilder()
      .setName("helpie")
      .setDescription("Helpie AI support assistant - all commands")
      // User-installable only
      .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
      // Allow in all contexts
      .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);

    // Add grouped commands as subcommand groups
    for (const [groupName, groupedCommand] of this.groupedCommands) {
      command.addSubcommandGroup((group: any) => {
        // Use first subcommand's description or generate one
        const firstSubcommand = Array.from(groupedCommand.subcommands.values())[0];
        const groupDescription = `${groupName.charAt(0).toUpperCase() + groupName.slice(1)} commands`;

        group.setName(groupName).setDescription(groupDescription);

        // Add each subcommand in the group
        for (const [subcommandName, commandModule] of groupedCommand.subcommands) {
          group.addSubcommand((sub: any) => {
            const originalData = commandModule.data;
            sub.setName(subcommandName).setDescription(originalData.description);

            // Copy options from the original command
            const options = (originalData as any).options;
            if (options && Array.isArray(options)) {
              for (const option of options) {
                // Skip subcommands and groups (type 1 and 2)
                if ((option as any).type !== 1 && (option as any).type !== 2) {
                  this.copyOption(sub, option);
                }
              }
            }

            return sub;
          });
        }

        return group;
      });
    }

    // Add simple commands as regular subcommands
    for (const [name, commandModule] of this.commands) {
      const originalData = commandModule.data;
      const originalJSON = originalData.toJSON();

      // Check if this command manually defines subcommand groups
      const hasGroups = originalJSON.options?.some((opt) => opt.type === 2); // Type 2 = SubcommandGroup

      if (hasGroups && originalJSON.options) {
        // This command manually uses subcommand groups, copy them directly
        for (const option of originalJSON.options) {
          if (option.type === 2 && "options" in option) {
            // SubcommandGroup
            command.addSubcommandGroup((group) => {
              group.setName(option.name).setDescription(option.description);

              // Add subcommands within the group
              if (option.options && Array.isArray(option.options)) {
                for (const subcommand of option.options) {
                  group.addSubcommand((sub) => {
                    sub.setName(subcommand.name).setDescription(subcommand.description);

                    // Copy options for the subcommand
                    if ("options" in subcommand && subcommand.options && Array.isArray(subcommand.options)) {
                      for (const opt of subcommand.options) {
                        this.copyOption(sub, opt);
                      }
                    }

                    return sub;
                  });
                }
              }

              return group;
            });
          }
        }
      } else {
        // Regular subcommand without groups
        command.addSubcommand((sub: SlashCommandSubcommandBuilder) => {
          sub.setName(name).setDescription(originalData.description);

          // Copy all options from the original command
          if (originalJSON.options && Array.isArray(originalJSON.options)) {
            for (const option of originalJSON.options) {
              // Skip subcommands and groups (type 1 and 2)
              if (option.type !== 1 && option.type !== 2) {
                this.copyOption(sub, option);
              }
            }
          }

          return sub;
        });
      }
    }

    return command;
  }

  /**
   * Copy an option from original command to subcommand
   * Uses Discord.js API JSON structure
   */
  private copyOption(
    subcommand: SlashCommandSubcommandBuilder,
    option: {
      type: number;
      name: string;
      description: string;
      required?: boolean;
      choices?: Array<{ name: string; value: string | number }>;
      min_value?: number;
      max_value?: number;
      min_length?: number;
      max_length?: number;
      autocomplete?: boolean;
    }
  ): void {
    const type = option.type;

    // Map Discord option types to builder methods
    switch (type) {
      case 3: // String
        subcommand.addStringOption((opt) => this.configureOption(opt, option));
        break;
      case 4: // Integer
        subcommand.addIntegerOption((opt) => this.configureOption(opt, option));
        break;
      case 5: // Boolean
        subcommand.addBooleanOption((opt) => this.configureOption(opt, option));
        break;
      case 6: // User
        subcommand.addUserOption((opt) => this.configureOption(opt, option));
        break;
      case 7: // Channel
        subcommand.addChannelOption((opt) => this.configureOption(opt, option));
        break;
      case 8: // Role
        subcommand.addRoleOption((opt) => this.configureOption(opt, option));
        break;
      case 10: // Number
        subcommand.addNumberOption((opt) => this.configureOption(opt, option));
        break;
      case 11: // Attachment
        subcommand.addAttachmentOption((opt) => this.configureOption(opt, option));
        break;
    }
  }

  /**
   * Configure an option with all its properties
   * Generic to work with all option builder types
   */
  private configureOption<T extends { setName: (name: string) => T; setDescription: (desc: string) => T }>(
    optionBuilder: T,
    originalOption: {
      name: string;
      description: string;
      required?: boolean;
      choices?: Array<{ name: string; value: string | number }>;
      min_value?: number;
      max_value?: number;
      min_length?: number;
      max_length?: number;
      autocomplete?: boolean;
    }
  ): T {
    optionBuilder.setName(originalOption.name).setDescription(originalOption.description);

    // Use type guards to check for method existence
    if (originalOption.required !== undefined && "setRequired" in optionBuilder) {
      (optionBuilder as any).setRequired(originalOption.required);
    }

    if (originalOption.choices && originalOption.choices.length > 0 && "addChoices" in optionBuilder) {
      (optionBuilder as any).addChoices(...originalOption.choices);
    }

    if (originalOption.min_value !== undefined && "setMinValue" in optionBuilder) {
      (optionBuilder as any).setMinValue(originalOption.min_value);
    }

    if (originalOption.max_value !== undefined && "setMaxValue" in optionBuilder) {
      (optionBuilder as any).setMaxValue(originalOption.max_value);
    }

    if (originalOption.min_length !== undefined && "setMinLength" in optionBuilder) {
      (optionBuilder as any).setMinLength(originalOption.min_length);
    }

    if (originalOption.max_length !== undefined && "setMaxLength" in optionBuilder) {
      (optionBuilder as any).setMaxLength(originalOption.max_length);
    }

    if (originalOption.autocomplete !== undefined && "setAutocomplete" in optionBuilder) {
      (optionBuilder as any).setAutocomplete(originalOption.autocomplete);
    }

    return optionBuilder;
  }

  /**
   * Handle /helpie command execution
   */
  async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommandName = interaction.options.getSubcommand();

    let commandModule: SlashCommandModule | undefined;

    // Check if this is a grouped command (from directory structure)
    if (group) {
      const groupedCommand = this.groupedCommands.get(group);
      if (groupedCommand) {
        commandModule = groupedCommand.subcommands.get(subcommandName);
      }

      // If not found in grouped commands, check regular commands (manual groups)
      if (!commandModule) {
        commandModule = this.commands.get(group);
      }
    } else {
      // Regular subcommand
      commandModule = this.commands.get(subcommandName);
    }

    if (!commandModule) {
      await interaction.reply({
        content: `❌ Unknown command: ${group ? `${group} ${subcommandName}` : subcommandName}`,
        ephemeral: true,
      });
      return;
    }

    // Check dev-only restriction
    if (commandModule.options?.devOnly) {
      const env = (await import("./FetchEnvs")).default();
      if (!env.OWNER_IDS.includes(interaction.user.id)) {
        await interaction.reply({
          content: "❌ This command is only available to bot developers.",
          ephemeral: true,
        });
        return;
      }
    }

    try {
      await commandModule.run(interaction, this.client);
    } catch (error) {
      const commandPath = group ? `${group} ${subcommandName}` : subcommandName;
      log.error(`Error executing command ${commandPath}:`, error);

      const errorMessage = {
        content: `❌ An error occurred while executing this command.`,
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }

  /**
   * Register the /helpie command and context menu commands with Discord
   * - Always updates the /helpie command completely (PUT replaces all)
   * - Deleted subcommands (marked with deleted: true) are automatically excluded
   * - Cleans up any removed context menu commands from Discord
   */
  async registerCommands(token: string, clientId: string): Promise<void> {
    log.info("Registering commands with Discord...");

    const rest = new REST({ version: "10" }).setToken(token);

    try {
      // Step 1: Fetch existing commands from Discord
      const existingCommands = (await rest.get(Routes.applicationCommands(clientId))) as any[];
      log.debug(`Found ${existingCommands.length} existing commands on Discord`);

      // Step 2: Build list of commands we want to register
      const commands: any[] = [];
      const commandNamesToKeep = new Set<string>();

      // Always add and update the main /helpie command
      // This rebuilds all subcommands, automatically excluding deleted ones
      const helpieCommand = this.buildHelpieCommand();
      const helpieJSON = helpieCommand.toJSON();
      commands.push(helpieJSON);
      commandNamesToKeep.add("helpie");

      // Count subcommands for logging
      const subcommandCount = (helpieJSON.options || []).reduce((count: number, opt: any) => {
        if (opt.type === 2) {
          // SubcommandGroup
          return count + (opt.options || []).length;
        } else if (opt.type === 1) {
          // Subcommand
          return count + 1;
        }
        return count;
      }, 0);

      log.debug(`Built /helpie command with ${subcommandCount} total subcommands`);

      // Add all context menu commands (deleted ones already filtered out in loadCommands)
      for (const [name, commandModule] of this.contextMenuCommands) {
        const contextMenuJSON = commandModule.data.toJSON();
        commands.push(contextMenuJSON);
        commandNamesToKeep.add(name);

        // Log context menu command type for debugging
        const cmdType = contextMenuJSON.type === 2 ? "Message" : contextMenuJSON.type === 3 ? "User" : "Unknown";
        log.debug(`Added context menu command: ${name} (type: ${cmdType})`);
      }

      // Separate commands by type for logging
      const slashCommands = commands.filter((cmd) => cmd.type === undefined || cmd.type === 1);
      const contextMenuCommands = commands.filter((cmd) => cmd.type === 2 || cmd.type === 3);

      log.debug(`Command breakdown: ${slashCommands.length} slash, ${contextMenuCommands.length} context menu`);

      // Step 3: Identify commands to delete (exist on Discord but not in our loaded commands)
      const commandsToDelete: any[] = [];
      for (const existingCmd of existingCommands) {
        if (!commandNamesToKeep.has(existingCmd.name)) {
          commandsToDelete.push(existingCmd);
          log.debug(`Marking command for deletion: ${existingCmd.name} (file removed or marked as deleted)`);
        }
      }

      // Step 4: Delete removed commands individually
      // This is safer than relying solely on PUT to remove them
      if (commandsToDelete.length > 0) {
        log.info(`Cleaning up ${commandsToDelete.length} removed commands...`);
        for (const cmd of commandsToDelete) {
          try {
            await rest.delete(Routes.applicationCommand(clientId, cmd.id));
            log.debug(`Deleted command: ${cmd.name}`);
          } catch (error) {
            log.error(`Failed to delete command ${cmd.name}:`, error);
          }
        }
      }

      // Step 5: Register/update all current commands using PUT
      // PUT completely replaces all commands - Discord automatically handles slash vs context menu based on type field
      log.info(`Registering ${commands.length} total commands (${slashCommands.length} slash + ${contextMenuCommands.length} context menu)...`);
      const data = (await rest.put(Routes.applicationCommands(clientId), { body: commands })) as any[];

      log.info(`✓ Successfully registered /helpie command with ${subcommandCount} subcommands and ${this.contextMenuCommands.size} context menu commands`);
      if (commandsToDelete.length > 0) {
        log.info(`✓ Cleaned up ${commandsToDelete.length} removed commands`);
      }
    } catch (error) {
      log.error("Failed to register commands:", error);
      throw error;
    }
  }

  /**
   * Recursively find all command files
   */
  private findCommandFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
      return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...this.findCommandFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Setup interaction handler and custom event listeners
   */
  setupInteractionHandler(): void {
    // Setup custom event listeners first
    this.setupEventListeners();

    // Setup interaction handling
    this.client.on("interactionCreate", async (interaction) => {
      // Handle button interactions
      if (interaction.isButton()) {
        // Check if this is a mobile ephemeral button
        if (interaction.customId.startsWith("ephemeral-mobile:")) {
          const { default: HelpieReplies } = await import("./HelpieReplies");
          await HelpieReplies.handleMobileButton(interaction);
        }
        return;
      }

      // Handle slash commands
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "helpie") {
          await this.handleCommand(interaction);
        }
        return;
      }

      // Handle autocomplete
      if (interaction.isAutocomplete()) {
        if (interaction.commandName === "helpie") {
          await this.handleAutocomplete(interaction);
        }
        return;
      }

      // Handle context menu commands
      if (interaction.isMessageContextMenuCommand() || interaction.isUserContextMenuCommand()) {
        await this.handleContextMenuCommand(interaction);
        return;
      }
    });

    log.info("Interaction handler registered for /helpie, context menu commands, and buttons");
  }

  /**
   * Handle autocomplete interactions
   */
  private async handleAutocomplete(interaction: any): Promise<void> {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommandName = interaction.options.getSubcommand();

    let commandModule: SlashCommandModule | undefined;

    // Check if this is a grouped command (from directory structure)
    if (group) {
      const groupedCommand = this.groupedCommands.get(group);
      if (groupedCommand) {
        commandModule = groupedCommand.subcommands.get(subcommandName);
      }

      // If not found in grouped commands, check regular commands (manual groups)
      if (!commandModule) {
        commandModule = this.commands.get(group);
      }
    } else {
      // Regular subcommand
      commandModule = this.commands.get(subcommandName);
    }

    if (!commandModule) {
      // No command found, respond with empty array
      await interaction.respond([]);
      return;
    }

    // Check if command has autocomplete handler
    if (typeof (commandModule as any).autocomplete === "function") {
      try {
        await (commandModule as any).autocomplete(interaction, this.client);
      } catch (error) {
        log.error(`Error executing autocomplete for ${subcommandName}:`, error);
        await interaction.respond([]);
      }
    } else {
      // No autocomplete handler, respond with empty array
      await interaction.respond([]);
    }
  }

  /**
   * Handle context menu command execution
   */
  private async handleContextMenuCommand(interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction): Promise<void> {
    const commandModule = this.contextMenuCommands.get(interaction.commandName);

    if (!commandModule) {
      await interaction.reply({
        content: `❌ Unknown context menu command: ${interaction.commandName}`,
        ephemeral: true,
      });
      return;
    }

    // Check dev-only restriction
    if (commandModule.options?.devOnly) {
      const env = (await import("./FetchEnvs")).default();
      if (!env.OWNER_IDS.includes(interaction.user.id)) {
        await interaction.reply({
          content: "❌ This command is only available to bot developers.",
          ephemeral: true,
        });
        return;
      }
    }

    try {
      // Call run function with proper Helpie-specific signature
      await commandModule.run(interaction, this.client);
    } catch (error) {
      log.error(`Error executing context menu command ${interaction.commandName}:`, error);

      const errorMessage = {
        content: `❌ An error occurred while executing this command.`,
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
}
