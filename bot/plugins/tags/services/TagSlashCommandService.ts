/**
 * TagSlashCommandService — Registers per-guild tag names as standalone slash commands.
 *
 * When a tag has `registerAsSlashCommand: true`, its name becomes a guild-scoped
 * slash command (e.g. /rules, /faq). The service:
 *
 * 1. Provides a guild command provider that feeds tag commands into CommandManager's
 *    registration flow so they're included in the PUT body alongside static commands.
 * 2. Provides a dynamic command resolver so InteractionHandler can route these
 *    commands to the tag use handler.
 * 3. Validates that tag names don't collide with existing static commands.
 * 4. Triggers guild command re-registration when tags are toggled.
 */

import { SlashCommandBuilder, userMention, ActionRowBuilder, ButtonStyle } from "discord.js";
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { CommandContext, CommandManager } from "../../../src/core/CommandManager.js";
import type { PermissionRegistry } from "../../../src/core/PermissionRegistry.js";
import type { LibAPI } from "../../lib/index.js";
import type { TagService } from "./TagService.js";
import TagModel from "../models/Tag.js";
import Modmail, { ModmailStatus } from "../../modmail/models/Modmail.js";
import { TAG_FORWARD_HANDLER_ID } from "../index.js";

const log = createLogger("tags:slash-commands");

export class TagSlashCommandService {
  private commandManager: CommandManager;
  private tagService: TagService;
  private lib: LibAPI;
  private permissionRegistry?: PermissionRegistry;

  constructor(commandManager: CommandManager, tagService: TagService, lib: LibAPI, permissionRegistry?: PermissionRegistry) {
    this.commandManager = commandManager;
    this.tagService = tagService;
    this.lib = lib;
    this.permissionRegistry = permissionRegistry;
  }

  /**
   * Set up the guild command provider and dynamic resolver.
   * Called once during plugin load.
   */
  register(): void {
    // Provider: feeds tag commands into guild registration
    this.commandManager.registerGuildCommandProvider((guildId) => this.getGuildTagCommands(guildId));

    // Resolver: handles execution of tag slash commands
    this.commandManager.registerDynamicCommandResolver((commandName, guildId) => this.resolveTagCommand(commandName, guildId));

    // Resolver: handles dynamic tag permission keys
    this.commandManager.registerDynamicPermissionResolver((commandName, guildId) => this.resolveTagPermissionKey(commandName, guildId));

    // Dynamic permission definitions for slash-command tags
    if (this.permissionRegistry) {
      this.permissionRegistry.registerDynamicProvider("tags.slash-commands", async (guildId) => {
        const tags = await TagModel.find({ guildId, registerAsSlashCommand: true }).select("name").lean();
        return [
          {
            categoryKey: "tags",
            actions: tags.map((tag) => ({
              key: `commands.${tag.name}`,
              label: `/${tag.name}`,
              description: "Tag slash command",
            })),
          },
        ];
      });
    }

    log.info("Tag slash command provider and resolver registered");
  }

  /**
   * Toggle a tag's slash command registration for a guild.
   * Returns an error message if validation fails, null on success.
   */
  async toggleSlashCommand(guildId: string, tagName: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    const tag = await this.tagService.getTag(guildId, tagName);
    if (!tag) {
      return { success: false, error: `Tag "${tagName}" not found` };
    }

    // When enabling, check for collision with static commands
    if (enabled) {
      const existingCommand = this.commandManager.getCommand(tagName.toLowerCase());
      if (existingCommand) {
        return {
          success: false,
          error: `Cannot register "${tagName}" as a slash command — it conflicts with the existing /${tagName} command`,
        };
      }
    }

    // Update the tag
    await TagModel.findOneAndUpdate({ guildId, name: tagName.toLowerCase() }, { $set: { registerAsSlashCommand: enabled } });

    // Re-register guild commands to reflect the change
    try {
      await this.commandManager.refreshGuildCommands(guildId);
    } catch (error) {
      log.error(`Failed to refresh guild commands after toggling tag slash command:`, error);
      return { success: false, error: "Tag updated but failed to sync commands with Discord" };
    }

    log.info(`Tag "${tagName}" slash command ${enabled ? "enabled" : "disabled"} in guild ${guildId}`);
    return { success: true };
  }

  /**
   * Guild command provider — returns SlashCommandBuilder data for
   * all tags in a guild that have registerAsSlashCommand enabled.
   */
  private async getGuildTagCommands(guildId: string): Promise<RESTPostAPIChatInputApplicationCommandsJSONBody[]> {
    try {
      const tags = await TagModel.find({
        guildId,
        registerAsSlashCommand: true,
      }).lean();

      return tags.map((tag) => {
        const contentPreview = tag.content.length > 80 ? tag.content.substring(0, 77) + "..." : tag.content;

        return new SlashCommandBuilder()
          .setName(tag.name)
          .setDescription(`Tag: ${contentPreview}`)
          .addUserOption((opt) => opt.setName("user").setDescription("User to mention with the tag").setRequired(false))
          .toJSON();
      });
    } catch (error) {
      log.error(`Failed to get tag commands for guild ${guildId}:`, error);
      return [];
    }
  }

  /**
   * Dynamic command resolver — if the command name matches a tag with
   * registerAsSlashCommand enabled, return a handler that sends the tag content.
   */
  private async resolveTagCommand(commandName: string, guildId: string | null): Promise<((context: CommandContext) => Promise<void>) | null> {
    if (!guildId) return null;

    const tag = await TagModel.findOne({
      guildId,
      name: commandName.toLowerCase(),
      registerAsSlashCommand: true,
    }).lean();

    if (!tag) return null;

    // Return the handler
    return async (context: CommandContext) => {
      const { interaction } = context;
      const user = interaction.options.getUser("user");

      // Increment usage counter (fire-and-forget)
      this.tagService.incrementUses(guildId, commandName);

      const content = user ? `${userMention(user.id)}\n${tag.content}` : tag.content;

      // Check if we're inside a modmail forum thread
      let forwardRow: ActionRowBuilder<any> | null = null;

      if (interaction.channel?.isThread()) {
        try {
          const modmail = await Modmail.findOne({
            forumThreadId: interaction.channelId,
            status: { $ne: ModmailStatus.CLOSED },
          });

          if (modmail) {
            const btn = this.lib.createButtonBuilderPersistent(TAG_FORWARD_HANDLER_ID, {
              tagContent: tag.content,
              tagName: tag.name,
            });
            btn.setLabel("Forward to User").setStyle(ButtonStyle.Primary).setEmoji("📨");
            await btn.ready();

            forwardRow = new ActionRowBuilder<any>().addComponents(btn);
          }
        } catch {
          // Modmail plugin may not be loaded
        }
      }

      await interaction.reply({
        content,
        ...(forwardRow ? { components: [forwardRow] } : {}),
      });
    };
  }

  private async resolveTagPermissionKey(commandName: string, guildId: string | null): Promise<string | null> {
    if (!guildId) return null;

    const tag = await TagModel.findOne({
      guildId,
      name: commandName.toLowerCase(),
      registerAsSlashCommand: true,
    })
      .select("name")
      .lean();

    if (!tag) return null;

    return `tags.commands.${tag.name}`;
  }

  /**
   * Get all tags in a guild that are registered as slash commands.
   */
  async getSlashCommandTags(guildId: string): Promise<{ name: string; uses: number }[]> {
    const tags = await TagModel.find({
      guildId,
      registerAsSlashCommand: true,
    })
      .select("name uses")
      .lean();

    return tags.map((t) => ({ name: t.name, uses: t.uses }));
  }
}
