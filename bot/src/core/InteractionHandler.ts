/**
 * InteractionHandler - Routes Discord interactions to commands and components
 *
 * Handles:
 * - Slash commands → CommandManager
 * - Button/Select menu → ComponentCallbackService
 * - Autocomplete → CommandManager (future)
 * - Modals → awaitModalSubmit pattern (handled inline)
 */

import {
  Events,
  type Interaction,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from "discord.js";
import type { HeimdallClient } from "../types/Client";
import type { CommandManager, CommandContext, AutocompleteContext, ContextMenuCommandContext } from "./CommandManager";
import type { ComponentCallbackService } from "./services/ComponentCallbackService";
import type { PluginAPI } from "../types/Plugin";
import type { PermissionService } from "./PermissionService";
import log from "../utils/logger";
import { captureException } from "../utils/sentry";

export interface InteractionHandlerOptions {
  client: HeimdallClient;
  commandManager: CommandManager;
  componentCallbackService: ComponentCallbackService;
  permissionService: PermissionService;
}

export class InteractionHandler {
  private client: HeimdallClient;
  private commandManager: CommandManager;
  private componentCallbackService: ComponentCallbackService;
  private permissionService: PermissionService;

  constructor(options: InteractionHandlerOptions) {
    this.client = options.client;
    this.commandManager = options.commandManager;
    this.componentCallbackService = options.componentCallbackService;
    this.permissionService = options.permissionService;
  }

  /**
   * Attach the interactionCreate handler to the client
   */
  attach(): void {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await this.handleInteraction(interaction);
      } catch (error) {
        log.error("Unhandled interaction error:", error);
        captureException(error, { context: "InteractionHandler" });
      }
    });

    log.info("InteractionHandler attached");
  }

  /**
   * Route interaction to appropriate handler
   */
  private async handleInteraction(interaction: Interaction): Promise<void> {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      await this.handleCommand(interaction);
      return;
    }

    // Button interactions
    if (interaction.isButton()) {
      await this.componentCallbackService.execute(interaction);
      return;
    }

    // Select menu interactions
    if (interaction.isAnySelectMenu()) {
      await this.componentCallbackService.execute(interaction);
      return;
    }

    // Context menu commands (message & user)
    if (interaction.isContextMenuCommand()) {
      await this.handleContextMenuCommand(interaction as MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction);
      return;
    }

    // Autocomplete
    if (interaction.isAutocomplete()) {
      await this.handleAutocomplete(interaction);
      return;
    }

    // Modal submissions are handled via awaitModalSubmit pattern
  }

  /**
   * Handle slash command execution
   */
  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const commandName = interaction.commandName;
    const command = this.commandManager.getCommand(commandName);

    if (!command) {
      // Try dynamic command resolution (e.g., tag slash commands)
      const dynamicHandler = await this.commandManager.resolveDynamicCommand(commandName, interaction.guildId);
      if (dynamicHandler) {
        const permissionKey = await this.commandManager.resolveDynamicPermissionKey(commandName, interaction.guildId);
        const member = await this.getGuildMember(interaction);
        if (permissionKey && interaction.guild && member) {
          const allowed = await this.permissionService.canPerformAction(interaction.guild.id, member, interaction.user.id, permissionKey);
          if (!allowed) {
            await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true }).catch(() => {});
            return;
          }
        }

        const context: CommandContext = {
          interaction,
          client: this.client,
          getPluginAPI: <T = PluginAPI>(name: string) => this.client.plugins.get(name) as T | undefined,
        };
        try {
          await dynamicHandler(context);
        } catch (error) {
          log.error(`Dynamic command ${commandName} execution failed:`, error);
          captureException(error, {
            context: "Dynamic Command Execution",
            command: commandName,
            guild: interaction.guildId,
            user: interaction.user.id,
          });
          const reply = { content: "❌ An error occurred while executing this command.", ephemeral: true };
          if (interaction.deferred) {
            await interaction.editReply(reply).catch(() => {});
          } else if (!interaction.replied) {
            await interaction.reply(reply).catch(() => {});
          }
        }
        return;
      }

      log.warn(`Unknown command: ${commandName}`);
      await interaction
        .reply({
          content: "❌ This command is not available.",
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }

    // Build command context with getPluginAPI helper
    const context: CommandContext = {
      interaction,
      client: this.client,
      getPluginAPI: <T = PluginAPI>(name: string) => this.client.plugins.get(name) as T | undefined,
    };

    const subcommandPath = this.getSubcommandPath(interaction);
    const permissionKey = this.commandManager.getCommandPermissionKey(commandName, subcommandPath);
    const member = await this.getGuildMember(interaction);
    if (permissionKey && interaction.guild && member) {
      const allowed = await this.permissionService.canPerformAction(interaction.guild.id, member, interaction.user.id, permissionKey);
      if (!allowed) {
        await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true }).catch(() => {});
        return;
      }
    }

    try {
      await command.execute(context);
    } catch (error) {
      log.error(`Command ${commandName} execution failed:`, error);
      captureException(error, {
        context: "Command Execution",
        command: commandName,
        guild: interaction.guildId,
        user: interaction.user.id,
      });

      // Try to respond if not already responded
      const reply = {
        content: "❌ An error occurred while executing this command.",
        ephemeral: true,
      };

      if (interaction.deferred) {
        await interaction.editReply(reply).catch(() => {});
      } else if (!interaction.replied) {
        await interaction.reply(reply).catch(() => {});
      }
    }
  }

  /**
   * Handle context menu command execution
   */
  private async handleContextMenuCommand(interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction): Promise<void> {
    const commandName = interaction.commandName;
    const command = this.commandManager.getContextMenuCommand(commandName);

    if (!command) {
      log.warn(`Unknown context menu command: ${commandName}`);
      await interaction
        .reply({
          content: "❌ This command is not available.",
          ephemeral: true,
        })
        .catch(() => {});
      return;
    }

    const context: ContextMenuCommandContext = {
      interaction,
      client: this.client,
      getPluginAPI: <T = PluginAPI>(name: string) => this.client.plugins.get(name) as T | undefined,
    };

    const permissionKey = this.commandManager.getContextMenuPermissionKey(commandName);
    const member = await this.getGuildMember(interaction);
    if (permissionKey && interaction.guild && member) {
      const allowed = await this.permissionService.canPerformAction(interaction.guild.id, member, interaction.user.id, permissionKey);
      if (!allowed) {
        await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true }).catch(() => {});
        return;
      }
    }

    try {
      await command.execute(context);
    } catch (error) {
      log.error(`Context menu command ${commandName} execution failed:`, error);
      captureException(error, {
        context: "Context Menu Command Execution",
        command: commandName,
        guild: interaction.guildId,
        user: interaction.user.id,
      });

      const reply = {
        content: "❌ An error occurred while executing this command.",
        ephemeral: true,
      };

      if (interaction.deferred) {
        await interaction.editReply(reply).catch(() => {});
      } else if (!interaction.replied) {
        await interaction.reply(reply).catch(() => {});
      }
    }
  }

  /**
   * Handle autocomplete interactions
   */
  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const commandName = interaction.commandName;
    const command = this.commandManager.getCommand(commandName);

    if (!command || !command.autocomplete) {
      await interaction.respond([]).catch(() => {});
      return;
    }

    const context: AutocompleteContext = {
      interaction,
      client: this.client,
      getPluginAPI: <T = PluginAPI>(name: string) => this.client.plugins.get(name) as T | undefined,
    };

    try {
      await command.autocomplete(context);
    } catch (error) {
      log.error(`Autocomplete for ${commandName} failed:`, error);
      captureException(error, {
        context: "Autocomplete",
        command: commandName,
        guild: interaction.guildId,
        user: interaction.user.id,
      });
      await interaction.respond([]).catch(() => {});
    }
  }

  private getSubcommandPath(interaction: ChatInputCommandInteraction): string | null {
    let subcommand: string | null = null;
    try {
      subcommand = interaction.options.getSubcommand(false);
    } catch {
      subcommand = null;
    }

    if (!subcommand) return null;

    let group: string | null = null;
    try {
      group = interaction.options.getSubcommandGroup(false);
    } catch {
      group = null;
    }

    return group ? `${group}.${subcommand}` : subcommand;
  }

  private async getGuildMember(interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction): Promise<import("discord.js").GuildMember | null> {
    if (!interaction.guild) return null;

    const member = interaction.member as import("discord.js").GuildMember | null | undefined;
    if (member?.roles?.cache) return member;

    try {
      return await interaction.guild.members.fetch(interaction.user.id);
    } catch {
      return null;
    }
  }
}
