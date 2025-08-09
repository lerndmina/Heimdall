import {
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuInteraction,
  Guild,
  CollectorFilter,
  ComponentType,
  InteractionResponse,
} from "discord.js";
import { BaseHook } from "../BaseHook";
import {
  HookType,
  HookPriority,
  HookContext,
  HookResult,
  BeforeCreationHookContext,
} from "../HookTypes";
import { ModmailConfigType } from "../../../models/ModmailConfig";
import { ModmailEmbeds } from "../../modmail/ModmailEmbeds";
import { ThingGetter } from "../../TinyUtils";
import { waitingEmoji } from "../../../Bot";
import log from "../../log";
import ms from "ms";

/**
 * Server selection hook for multi-guild modmail scenarios
 * Handles the logic for users to select which server they want to open modmail in
 */
export class ServerSelectionHook extends BaseHook {
  constructor() {
    super(
      "server-selection",
      "Server Selection",
      "Handles server selection when user is in multiple servers with modmail",
      HookType.BEFORE_CREATION,
      HookPriority.HIGH
    );

    // Execute when there are available guilds and no guild selected yet
    this.addCondition((context) => {
      const creationContext = context as BeforeCreationHookContext;
      return creationContext.availableGuilds.length > 0 && !creationContext.selectedGuildId;
    });
  }

  protected async executeHook(context: HookContext): Promise<HookResult> {
    const creationContext = context as BeforeCreationHookContext;
    const { client, user, availableGuilds, originalMessage } = creationContext;

    log.debug(`ServerSelectionHook: User ${user.id} has ${availableGuilds.length} guild options`);

    try {
      // If only one guild available, auto-select it
      if (availableGuilds.length === 1) {
        const { guild, config } = availableGuilds[0];
        log.debug(`ServerSelectionHook: Auto-selecting single guild ${guild.name} (${guild.id})`);

        return this.createSuccessResult({
          selectedGuildId: guild.id,
          selectedGuild: guild,
          selectedConfig: config,
        });
      }

      // Multiple guilds - show selection menu
      const result = await this.showServerSelection(creationContext);

      if (!result.success) {
        return this.createErrorResult(
          result.error || "Server selection failed",
          result.userMessage || "Failed to select server. Please try again."
        );
      }

      // Return the selected guild ID for next hooks to use
      return this.createSuccessResult({
        selectedGuildId: result.selectedGuildId,
        selectedGuild: result.selectedGuild,
        selectedConfig: result.selectedConfig,
        interaction: result.interaction, // Pass interaction to next hooks
      });
    } catch (error) {
      log.error("ServerSelectionHook: Unexpected error:", error);
      return this.createErrorResult(
        error instanceof Error ? error.message : "Unknown error",
        "An error occurred while selecting the server. Please try again."
      );
    }
  }

  /**
   * Show server selection interface to user
   */
  private async showServerSelection(
    context: BeforeCreationHookContext
  ): Promise<ServerSelectionResult> {
    const { client, user, availableGuilds, originalMessage, sharedBotMessage } = context;

    try {
      // Use shared bot message or fallback to reply
      const reply = await this.createServerSelectionMessage(
        sharedBotMessage || originalMessage,
        availableGuilds,
        !!sharedBotMessage
      );

      if (!reply) {
        return {
          success: false,
          error: "Failed to create server selection message",
          userMessage: "Unable to show server selection. Please try again.",
        };
      }

      // Wait for user selection
      const selectionResult = await this.waitForServerSelection(reply, user.id, availableGuilds);

      return selectionResult;
    } catch (error) {
      log.error("Error in showServerSelection:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        userMessage: "Failed to process server selection. Please try again.",
      };
    }
  }

  /**
   * Create the server selection message
   */
  private async createServerSelectionMessage(
    message: any,
    availableGuilds: Array<{ guild: Guild; config: ModmailConfigType }>,
    isEdit: boolean = false
  ): Promise<any> {
    const stringSelectMenuID = `guildList-${message.id}-${Date.now()}`;
    const guildList = new StringSelectMenuBuilder()
      .setCustomId(stringSelectMenuID)
      .setPlaceholder("Select a server")
      .setMinValues(1)
      .setMaxValues(1);

    // Add all servers with modmail to the selection
    for (const { guild, config } of availableGuilds) {
      guildList.addOptions([
        {
          label: guild.name,
          value: JSON.stringify({
            guild: config.guildId,
            channel: config.forumChannelId,
            staffRoleId: config.staffRoleId,
          }),
          description: (config.guildDescription || `Open modmail in ${guild.name}`) as string,
        },
      ]);
    }

    const cancelListEntryId = `cancel-${message.id}`;
    guildList.addOptions({
      label: "Cancel",
      value: cancelListEntryId,
      description: "Cancel the modmail thread creation.",
      emoji: "❌",
    });

    const row = new ActionRowBuilder().addComponents(guildList);

    const messageOptions = {
      embeds: [ModmailEmbeds.selectServer(message.client)],
      content: "",
      components: [row as any],
    };

    // Edit existing message or reply to original
    if (isEdit) {
      await message.edit(messageOptions);
      return message;
    } else {
      return await message.reply(messageOptions);
    }
  }

  /**
   * Wait for user to select a server
   */
  private async waitForServerSelection(
    reply: any,
    userId: string,
    availableGuilds: Array<{ guild: Guild; config: ModmailConfigType }>
  ): Promise<ServerSelectionResult> {
    return new Promise((resolve) => {
      const selectMenuFilter = (i: StringSelectMenuInteraction) =>
        i.user.id === userId && i.customId.startsWith("guildList-");

      const collector = reply.createMessageComponentCollector({
        filter: selectMenuFilter,
        time: ms("5min"),
        max: 1,
      });

      collector.on("collect", async (interaction: StringSelectMenuInteraction) => {
        try {
          const selectedValue = interaction.values[0];

          // Check if user cancelled
          if (selectedValue.startsWith("cancel-")) {
            await interaction.update({
              content: "",
              embeds: [ModmailEmbeds.cancelled(interaction.client)],
              components: [],
            });
            resolve({
              success: false,
              error: "User cancelled server selection",
              userMessage: "Server selection cancelled.",
            });
            return;
          }

          // Parse selected guild info
          const value = JSON.parse(selectedValue);
          const selectedGuildId = value.guild;
          const channelId = value.channel;
          const staffRoleId = value.staffRoleId;

          // Find the corresponding guild and config
          const guildMatch = availableGuilds.find(
            ({ config }) => config.guildId === selectedGuildId
          );

          if (!guildMatch) {
            await interaction.update({
              content: "",
              embeds: [
                ModmailEmbeds.error(
                  interaction.client,
                  "Server Error",
                  "Selected server configuration not found."
                ),
              ],
              components: [],
            });
            resolve({
              success: false,
              error: "Selected guild not found in available guilds",
              userMessage: "Selected server is no longer available.",
            });
            return;
          }

          // Acknowledge the selection
          await interaction.update({
            content: waitingEmoji,
            embeds: [],
            components: [],
          });

          log.debug(`ServerSelectionHook: User ${userId} selected guild ${selectedGuildId}`);

          resolve({
            success: true,
            selectedGuildId,
            selectedGuild: guildMatch.guild,
            selectedConfig: guildMatch.config,
            interaction,
          });
        } catch (error) {
          log.error("Error processing server selection:", error);
          resolve({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            userMessage: "Failed to process your selection. Please try again.",
          });
        }
      });

      collector.on("end", (collected) => {
        if (collected.size === 0) {
          log.debug("ServerSelectionHook: Selection timed out");
          resolve({
            success: false,
            error: "Server selection timed out",
            userMessage: "Server selection timed out. Please try again.",
          });
        }
      });
    });
  }
}

/**
 * Result of server selection process
 */
interface ServerSelectionResult {
  success: boolean;
  selectedGuildId?: string;
  selectedGuild?: Guild;
  selectedConfig?: ModmailConfigType;
  interaction?: StringSelectMenuInteraction;
  error?: string;
  userMessage?: string;
}
