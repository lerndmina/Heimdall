import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, EmbedBuilder, Client, Colors } from "discord.js";
import type { CommandHandler } from "../CommandHandler";
import type { ManagementConfig, CommandFilters } from "../types/Management";
import type { ModernCommandConfig, ModernCommandContext } from "../types/Command";

export class ManagementCommands {
  private handler: CommandHandler;
  private config: ManagementConfig;

  constructor(handler: CommandHandler, config: ManagementConfig) {
    this.handler = handler;
    this.config = config;
  }

  /**
   * Check if user is authorized to use management commands
   */
  private isAuthorized(userId: string): boolean {
    return this.config.ownerIds.includes(userId);
  }

  /**
   * Check if command can be used in current context
   */
  private canUseInContext(interaction: ChatInputCommandInteraction): boolean {
    const isInGuild = Boolean(interaction.guild);
    const isInDM = !isInGuild;

    return (isInGuild && this.config.allowGuild) || (isInDM && this.config.allowDMs);
  }

  /**
   * Create error embed
   */
  private createErrorEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder().setTitle(`❌ ${title}`).setDescription(description).setColor(Colors.Red).setTimestamp();
  }

  /**
   * Create success embed
   */
  private createSuccessEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder().setTitle(`✅ ${title}`).setDescription(description).setColor(Colors.Green).setTimestamp();
  }

  /**
   * Create info embed
   */
  private createInfoEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder().setTitle(`ℹ️ ${title}`).setDescription(description).setColor(Colors.Blue).setTimestamp();
  }

  /**
   * Get the management commands as LoadedCommand objects
   */
  getManagementCommands() {
    const commands = [];

    // /cmd reload command
    commands.push({
      name: "cmd-reload",
      data: new SlashCommandBuilder()
        .setName("cmd-reload")
        .setDescription("Reload a specific command or all commands")
        .addStringOption((option) => option.setName("command").setDescription("Specific command to reload (leave empty to reload all)").setRequired(false).setAutocomplete(true))
        .setDefaultMemberPermissions(0), // Only administrators by default

      config: {
        devOnly: false,
        deleted: false,
        userPermissions: [],
        botPermissions: [],
        category: "management",
      } as ModernCommandConfig,

      execute: async (interaction: ChatInputCommandInteraction, client: Client, handler: CommandHandler) => {
        if (!this.isAuthorized(interaction.user.id)) {
          await interaction.reply({
            embeds: [this.createErrorEmbed("Unauthorized", "You don't have permission to use management commands.")],
            ephemeral: true,
          });
          return;
        }

        if (!this.canUseInContext(interaction)) {
          const contextError = interaction.guild ? "Guild commands are disabled" : "DM commands are disabled";
          await interaction.reply({
            embeds: [this.createErrorEmbed("Context Error", contextError)],
            ephemeral: true,
          });
          return;
        }

        const commandName = interaction.options.getString("command");
        await interaction.deferReply({ ephemeral: true });

        const commandManager = handler.getCommandManager();
        if (!commandManager) {
          await interaction.editReply({
            embeds: [this.createErrorEmbed("Service Error", "Command management service is not available.")],
          });
          return;
        }

        try {
          const results = await commandManager.reloadCommand(commandName || undefined);

          if (results.length === 1) {
            // Single command reload
            const result = results[0];
            if (result.success) {
              await interaction.editReply({
                embeds: [this.createSuccessEmbed("Command Reloaded", `Successfully reloaded **${result.commandName}** in ${result.reloadTime}ms`)],
              });
            } else {
              await interaction.editReply({
                embeds: [this.createErrorEmbed("Reload Failed", `Failed to reload **${result.commandName}**: ${result.error}`)],
              });
            }
          } else {
            // Multiple commands reload
            const successful = results.filter((r: any) => r.success).length;
            const failed = results.length - successful;
            const totalTime = results.reduce((sum: number, r: any) => sum + r.reloadTime, 0);

            await interaction.editReply({
              embeds: [this.createInfoEmbed("Bulk Reload Complete", `Reloaded ${results.length} commands in ${totalTime}ms\n✅ Successful: ${successful}\n❌ Failed: ${failed}`)],
            });
          }
        } catch (error) {
          await interaction.editReply({
            embeds: [this.createErrorEmbed("Reload Error", `An error occurred: ${error}`)],
          });
        }
      },

      autocomplete: async (interaction: AutocompleteInteraction, client: Client, handler: CommandHandler) => {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const commandManager = handler.getCommandManager();

        if (!commandManager) {
          await interaction.respond([]);
          return;
        }

        const commandList = commandManager.listCommands();

        const choices = commandList.commands
          .filter((cmd) => cmd.name.toLowerCase().includes(focusedValue))
          .slice(0, 25)
          .map((cmd) => ({
            name: `${cmd.name} ${cmd.enabled ? "✅" : "❌"}`,
            value: cmd.name,
          }));

        await interaction.respond(choices);
      },

      isLegacy: false,
      category: "management",
    });

    // /cmd disable command
    commands.push({
      name: "cmd-disable",
      data: new SlashCommandBuilder()
        .setName("cmd-disable")
        .setDescription("Temporarily disable a command")
        .addStringOption((option) => option.setName("command").setDescription("Command name to disable").setRequired(true).setAutocomplete(true))
        .setDefaultMemberPermissions(0),

      config: {
        devOnly: false,
        deleted: false,
        userPermissions: [],
        botPermissions: [],
        category: "management",
      } as ModernCommandConfig,

      execute: async (interaction: ChatInputCommandInteraction, client: Client, handler: CommandHandler) => {
        if (!this.isAuthorized(interaction.user.id)) {
          await interaction.reply({
            embeds: [this.createErrorEmbed("Unauthorized", "You don't have permission to use management commands.")],
            ephemeral: true,
          });
          return;
        }

        const commandName = interaction.options.getString("command", true);
        const commandManager = handler.getCommandManager();

        if (!commandManager) {
          await interaction.reply({
            embeds: [this.createErrorEmbed("Service Error", "Command management service is not available.")],
            ephemeral: true,
          });
          return;
        }

        const success = await commandManager.disableCommand(commandName);

        if (success) {
          await interaction.reply({
            embeds: [this.createSuccessEmbed("Command Disabled", `Successfully disabled **${commandName}**`)],
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            embeds: [this.createErrorEmbed("Disable Failed", `Could not disable **${commandName}** (command not found)`)],
            ephemeral: true,
          });
        }
      },

      autocomplete: async (interaction: AutocompleteInteraction, client: Client, handler: CommandHandler) => {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const commandManager = handler.getCommandManager();

        if (!commandManager) {
          await interaction.respond([]);
          return;
        }

        const commandList = commandManager.listCommands({ status: "enabled" });

        const choices = commandList.commands
          .filter((cmd) => cmd.name.toLowerCase().includes(focusedValue))
          .slice(0, 25)
          .map((cmd) => ({
            name: cmd.name,
            value: cmd.name,
          }));

        await interaction.respond(choices);
      },

      isLegacy: false,
      category: "management",
    });

    // /cmd enable command
    commands.push({
      name: "cmd-enable",
      data: new SlashCommandBuilder()
        .setName("cmd-enable")
        .setDescription("Re-enable a disabled command")
        .addStringOption((option) => option.setName("command").setDescription("Command name to enable").setRequired(true).setAutocomplete(true))
        .setDefaultMemberPermissions(0),

      config: {
        devOnly: false,
        deleted: false,
        userPermissions: [],
        botPermissions: [],
        category: "management",
      } as ModernCommandConfig,

      execute: async (interaction: ChatInputCommandInteraction, client: Client, handler: CommandHandler) => {
        if (!this.isAuthorized(interaction.user.id)) {
          await interaction.reply({
            embeds: [this.createErrorEmbed("Unauthorized", "You don't have permission to use management commands.")],
            ephemeral: true,
          });
          return;
        }

        const commandName = interaction.options.getString("command", true);
        const commandManager = handler.getCommandManager();

        if (!commandManager) {
          await interaction.reply({
            embeds: [this.createErrorEmbed("Service Error", "Command management service is not available.")],
            ephemeral: true,
          });
          return;
        }

        const success = await commandManager.enableCommand(commandName);

        if (success) {
          await interaction.reply({
            embeds: [this.createSuccessEmbed("Command Enabled", `Successfully enabled **${commandName}**`)],
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            embeds: [this.createErrorEmbed("Enable Failed", `Could not enable **${commandName}** (command not found)`)],
            ephemeral: true,
          });
        }
      },

      autocomplete: async (interaction: AutocompleteInteraction, client: Client, handler: CommandHandler) => {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const commandManager = handler.getCommandManager();

        if (!commandManager) {
          await interaction.respond([]);
          return;
        }

        const commandList = commandManager.listCommands({ status: "disabled" });

        const choices = commandList.commands
          .filter((cmd) => cmd.name.toLowerCase().includes(focusedValue))
          .slice(0, 25)
          .map((cmd) => ({
            name: cmd.name,
            value: cmd.name,
          }));

        await interaction.respond(choices);
      },

      isLegacy: false,
      category: "management",
    });

    return commands;
  }

  /**
   * Get all management commands
   */
  public getCommands() {
    return this.getManagementCommands();
  }
}
