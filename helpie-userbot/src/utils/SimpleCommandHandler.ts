/**
 * Simple Command Loader for Helpie
 *
 * Loads all commands from commands/user/ and converts them into subcommands
 * under /helpie with full argument support.
 */

import { SlashCommandBuilder, SlashCommandSubcommandBuilder, ChatInputCommandInteraction, Client, ApplicationIntegrationType, InteractionContextType, REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";
import log from "./log";

export interface CommandModule {
  data: any; // SlashCommandBuilder from the original command
  run: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
  options?: {
    devOnly?: boolean;
    deleted?: boolean;
  };
}

export class SimpleCommandHandler {
  private commands: Map<string, CommandModule> = new Map();
  private client: Client;
  private commandsPath: string;

  constructor(client: Client, commandsPath: string) {
    this.client = client;
    this.commandsPath = commandsPath;
  }

  /**
   * Load all commands from the commands directory
   */
  async loadCommands(): Promise<void> {
    log.info("Loading commands...");
    this.commands.clear();

    const commandFiles = this.findCommandFiles(this.commandsPath);

    for (const filePath of commandFiles) {
      try {
        // Clear require cache for hot reload
        delete require.cache[require.resolve(filePath)];

        const commandModule: CommandModule = await import(filePath);

        if (!commandModule.data || !commandModule.run) {
          log.debug(`Skipping ${filePath} - missing data or run function`);
          continue;
        }

        // Skip deleted commands
        if (commandModule.options?.deleted) {
          log.debug(`Skipping deleted command: ${commandModule.data.name}`);
          continue;
        }

        this.commands.set(commandModule.data.name, commandModule);
        log.debug(`Loaded command: ${commandModule.data.name}`);
      } catch (error) {
        log.error(`Failed to load command from ${filePath}:`, error);
      }
    }

    log.info(`Loaded ${this.commands.size} commands`);
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

    // Add each command as a subcommand or subcommand group
    for (const [name, commandModule] of this.commands) {
      const originalData = commandModule.data;

      // Check if this command has subcommand groups
      const hasGroups = originalData.options?.some((opt: any) => opt.type === 2); // Type 2 = SubcommandGroup

      if (hasGroups) {
        // This command uses subcommand groups, copy them directly
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
    // Check if this is a grouped subcommand or regular subcommand
    const group = interaction.options.getSubcommandGroup(false);
    const subcommandName = interaction.options.getSubcommand();

    // For grouped commands, the command name is the group name
    // For regular commands, it's just the subcommand name
    const commandName = group || subcommandName;
    const commandModule = this.commands.get(commandName);

    if (!commandModule) {
      await interaction.reply({
        content: `❌ Unknown command: ${commandName}`,
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
      log.error(`Error executing command ${commandName}:`, error);

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
   * Register the /helpie command with Discord
   */
  async registerCommands(token: string, clientId: string): Promise<void> {
    log.info("Registering /helpie command with Discord...");

    const command = this.buildHelpieCommand();
    const rest = new REST({ version: "10" }).setToken(token);

    try {
      const data = (await rest.put(Routes.applicationCommands(clientId), { body: [command.toJSON()] })) as any[];

      log.info(`Successfully registered /helpie command with ${this.commands.size} subcommands`);
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
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== "helpie") return;

      await this.handleCommand(interaction);
    });

    log.info("Interaction handler registered for /helpie");
  }
}
