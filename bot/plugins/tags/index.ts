/**
 * Tags Plugin — Guild-specific text tags with CRUD, usage tracking, and autocomplete
 *
 * Provides:
 * - Per-guild tags with unique names, content up to 2000 chars, and usage counters
 * - /tag use|create|edit|delete|list commands with autocomplete
 * - Dashboard API routes for full CRUD and usage tracking
 * - Forward-to-user button when a tag is sent inside a modmail thread
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";
import type { ModmailPluginAPI } from "../modmail/index.js";
import type { HeimdallClient } from "../../src/types/Client.js";
import { ModmailEmbeds } from "../modmail/utils/ModmailEmbeds.js";
import Modmail, { ModmailStatus, MessageType, MessageContext } from "../modmail/models/Modmail.js";

// Import model to register with Mongoose
import "./models/Tag.js";

// Import service
import { TagService } from "./services/TagService.js";
import { TagSlashCommandService } from "./services/TagSlashCommandService.js";

/** Handler ID for the persistent forward-to-user button */
export const TAG_FORWARD_HANDLER_ID = "tags.forward_to_modmail";

/** Public API exposed to other plugins */
export interface TagsPluginAPI extends PluginAPI {
  version: string;
  tagService: TagService;
  tagSlashCommandService: TagSlashCommandService;
  lib: LibAPI;
}

let tagService: TagService;
let tagSlashCommandService: TagSlashCommandService;

export async function onLoad(context: PluginContext): Promise<TagsPluginAPI> {
  const { logger, dependencies, client, commandManager } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("tags requires lib plugin");

  // Initialize services
  tagService = new TagService();
  tagSlashCommandService = new TagSlashCommandService(commandManager, tagService, lib);
  tagSlashCommandService.register();

  // Register the persistent handler for forwarding tags to modmail recipients
  lib.componentCallbackService.registerPersistentHandler(TAG_FORWARD_HANDLER_ID, async (interaction) => {
    if (!interaction.isButton()) return;

    const metadata = await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    if (!metadata || !metadata.tagContent) {
      await interaction.reply({ content: "❌ Could not retrieve tag content.", ephemeral: true });
      return;
    }

    const tagContent = metadata.tagContent as string;
    const tagName = metadata.tagName as string;

    // Find the modmail for this thread
    const threadId = interaction.channelId;
    const modmail = await Modmail.findOne({
      forumThreadId: threadId,
      status: { $ne: ModmailStatus.CLOSED },
    });

    if (!modmail) {
      await interaction.reply({ content: "❌ This thread is not an active modmail ticket.", ephemeral: true });
      return;
    }

    // Get the modmail recipient
    const user = await lib.thingGetter.getUser(modmail.userId as string);
    if (!user) {
      await interaction.reply({ content: "❌ Could not find the modmail recipient.", ephemeral: true });
      return;
    }

    // Get staff display name
    const guild = await lib.thingGetter.getGuild(modmail.guildId as string);
    const staffMember = guild ? await lib.thingGetter.getMember(guild, interaction.user.id) : null;
    const staffName = staffMember ? lib.thingGetter.getMemberName(staffMember) : lib.thingGetter.getUsername(interaction.user);

    // Format the tag content as a staff reply
    const formattedContent =
      `**${staffName}:**\n${tagContent}\n\n` +
      `-# This message was sent by the staff of ${guild?.name || "the server"} in response to your modmail.\n` +
      `-# To reply, simply send a message in this DM.\n` +
      `-# If you want to close this thread, just click the close button above.`;

    try {
      const dm = await user.send({ content: formattedContent });

      // React with 📨 on the message containing the button
      try {
        await interaction.message?.react("📨");
      } catch {
        // Ignore reaction failures
      }

      // Add to modmail message history
      const modmailDoc = modmail as any;
      modmailDoc.messages.push({
        messageId: `tag-fwd-${Date.now()}`,
        authorId: interaction.user.id,
        authorType: MessageType.STAFF,
        context: MessageContext.BOTH,
        content: tagContent,
        discordMessageId: interaction.message?.id,
        discordDmMessageId: dm.id,
        isStaffOnly: false,
        attachments: [],
        timestamp: new Date(),
        isEdited: false,
        isDeleted: false,
        deliveredToDm: true,
        deliveredToThread: true,
      });

      // Update activity timestamps
      modmail.lastStaffActivityAt = new Date();
      modmail.autoCloseWarningAt = null as any;
      await modmail.save();

      await interaction.reply({ content: `📨 Tag **${tagName}** forwarded to user.`, ephemeral: true });

      logger.debug(`Tag "${tagName}" forwarded to user ${modmail.userId} in modmail ${modmail.modmailId}`);
    } catch (error) {
      logger.error(`Failed to forward tag to user for modmail ${modmail.modmailId}:`, error);
      await interaction.reply({
        content: "❌ Failed to send message. The user may have DMs disabled or blocked the bot.",
        ephemeral: true,
      });
    }
  });

  logger.info("✅ Tags plugin loaded");

  return {
    version: "1.0.0",
    tagService,
    tagSlashCommandService,
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Tags plugin unloaded");
}

export const commands = "./commands";
export const api = "./api";
