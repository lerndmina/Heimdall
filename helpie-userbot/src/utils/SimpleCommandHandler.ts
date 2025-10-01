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
import log from "./log";

export interface CommandModule {
  data: any; // SlashCommandBuilder or ContextMenuCommandBuilder from the original command
  run: (interaction: any, client: Client) => Promise<void>;
  options?: {
    devOnly?: boolean;
    deleted?: boolean;
  };
}

interface GroupedCommand {
  group: string;
  subcommands: Map<string, CommandModule>;
}

export class SimpleCommandHandler {
  private commands: Map<string, CommandModule> = new Map();
  private groupedCommands: Map<string, GroupedCommand> = new Map();
  private contextMenuCommands: Map<string, CommandModule> = new Map();
  private client: Client;
  private commandsPath: string;

  constructor(client: Client, commandsPath: string) {
    this.client = client;
    this.commandsPath = commandsPath;
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
    log.info("Loading commands...");
    this.commands.clear();
    this.groupedCommands.clear();
    this.contextMenuCommands.clear();

    const commandFiles = this.findCommandFiles(this.commandsPath);
    let deletedCount = 0;

    for (const filePath of commandFiles) {
      try {
        // Clear require cache for hot reload
        delete require.cache[require.resolve(filePath)];

        const commandModule: CommandModule = await import(filePath);

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
        if (this.isContextMenuCommand(commandModule.data)) {
          this.contextMenuCommands.set(commandModule.data.name, commandModule);
          log.debug(`Loaded context menu command: ${commandModule.data.name}`);
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
   * Check if a command data object is a context menu command
   */
  private isContextMenuCommand(data: any): boolean {
    // Check if it's a ContextMenuCommandBuilder instance or has context menu type
    return data instanceof ContextMenuCommandBuilder || data.type === ApplicationCommandType.Message || data.type === ApplicationCommandType.User;
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
            if (originalData.options && Array.isArray(originalData.options)) {
              for (const option of originalData.options) {
                // Skip subcommands and groups (type 1 and 2)
                if (option.type !== 1 && option.type !== 2) {
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

      // Check if this command manually defines subcommand groups
      const hasGroups = originalData.options?.some((opt: any) => opt.type === 2); // Type 2 = SubcommandGroup

      if (hasGroups) {
        // This command manually uses subcommand groups, copy them directly
        for (const option of originalData.options) {
          if (option.type === 2) {
            // SubcommandGroup
            command.addSubcommandGroup((group: any) => {
              group.setName(option.name).setDescription(option.description);

              // Add subcommands within the group
              if (option.options && Array.isArray(option.options)) {
                for (const subcommand of option.options) {
                  group.addSubcommand((sub: any) => {
                    sub.setName(subcommand.name).setDescription(subcommand.description);

                    // Copy options for the subcommand
                    if (subcommand.options && Array.isArray(subcommand.options)) {
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
          if (originalData.options && Array.isArray(originalData.options)) {
            for (const option of originalData.options) {
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
   */
  private copyOption(subcommand: any, option: any): void {
    const type = option.type;

    // Map Discord option types to builder methods
    switch (type) {
      case 3: // String
        subcommand.addStringOption((opt: any) => this.configureOption(opt, option));
        break;
      case 4: // Integer
        subcommand.addIntegerOption((opt: any) => this.configureOption(opt, option));
        break;
      case 5: // Boolean
        subcommand.addBooleanOption((opt: any) => this.configureOption(opt, option));
        break;
      case 6: // User
        subcommand.addUserOption((opt: any) => this.configureOption(opt, option));
        break;
      case 7: // Channel
        subcommand.addChannelOption((opt: any) => this.configureOption(opt, option));
        break;
      case 8: // Role
        subcommand.addRoleOption((opt: any) => this.configureOption(opt, option));
        break;
      case 10: // Number
        subcommand.addNumberOption((opt: any) => this.configureOption(opt, option));
        break;
      case 11: // Attachment
        subcommand.addAttachmentOption((opt: any) => this.configureOption(opt, option));
        break;
    }
  }

  /**
   * Configure an option with all its properties
   */
  private configureOption(optionBuilder: any, originalOption: any): any {
    optionBuilder.setName(originalOption.name).setDescription(originalOption.description);

    if (originalOption.required !== undefined) {
      optionBuilder.setRequired(originalOption.required);
    }

    if (originalOption.choices && originalOption.choices.length > 0) {
      optionBuilder.addChoices(...originalOption.choices);
    }

    if (originalOption.min_value !== undefined) {
      optionBuilder.setMinValue(originalOption.min_value);
    }

    if (originalOption.max_value !== undefined) {
      optionBuilder.setMaxValue(originalOption.max_value);
    }

    if (originalOption.min_length !== undefined) {
      optionBuilder.setMinLength(originalOption.min_length);
    }

    if (originalOption.max_length !== undefined) {
      optionBuilder.setMaxLength(originalOption.max_length);
    }

    if (originalOption.autocomplete !== undefined) {
      optionBuilder.setAutocomplete(originalOption.autocomplete);
    }

    return optionBuilder;
  }

  /**
   * Handle /helpie command execution
   */
  async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommandName = interaction.options.getSubcommand();

    let commandModule: CommandModule | undefined;

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
        commands.push(commandModule.data.toJSON());
        commandNamesToKeep.add(name);
      }

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
      // PUT completely replaces the command, so /helpie is always fully updated
      log.info(`Registering ${commands.length} commands (including ${subcommandCount} /helpie subcommands)...`);
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
   * Setup interaction handler
   */
  setupInteractionHandler(): void {
    this.client.on("interactionCreate", async (interaction) => {
      // Handle slash commands
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "helpie") {
          await this.handleCommand(interaction);
        }
        return;
      }

      // Handle context menu commands
      if (interaction.isMessageContextMenuCommand() || interaction.isUserContextMenuCommand()) {
        await this.handleContextMenuCommand(interaction);
        return;
      }
    });

    log.info("Interaction handler registered for /helpie and context menu commands");
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
      // Call run function with legacy props format
      await commandModule.run({ interaction, client: this.client, handler: this as any }, this.client);
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
