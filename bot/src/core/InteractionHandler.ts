/**
 * InteractionHandler - Routes Discord interactions to commands and components
 *
 * Handles:
 * - Slash commands → CommandManager
 * - Button/Select menu → ComponentCallbackService
 * - Autocomplete → CommandManager (future)
 * - Modals → awaitModalSubmit pattern (handled inline)
 */

import { Events, type Interaction, type ChatInputCommandInteraction, type AutocompleteInteraction } from "discord.js";
import type { HeimdallClient } from "../types/Client";
import type { CommandManager, CommandContext, AutocompleteContext } from "./CommandManager";
import type { ComponentCallbackService } from "./services/ComponentCallbackService";
import type { PluginAPI } from "../types/Plugin";
import log from "../utils/logger";
import { captureException } from "../utils/sentry";

export interface InteractionHandlerOptions {
  client: HeimdallClient;
  commandManager: CommandManager;
  componentCallbackService: ComponentCallbackService;
}

export class InteractionHandler {
  private client: HeimdallClient;
  private commandManager: CommandManager;
  private componentCallbackService: ComponentCallbackService;

  constructor(options: InteractionHandlerOptions) {
    this.client = options.client;
    this.commandManager = options.commandManager;
    this.componentCallbackService = options.componentCallbackService;
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
}
