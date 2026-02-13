/**
 * TempVCInteractionHandler - Button/select menu interaction handling for TempVC control panels
 *
 * All control panel buttons use persistent ComponentCallbackService handlers
 * so they survive bot restarts. Confirmation dialogs use ephemeral (TTL-based) callbacks.
 *
 * Registered handlers:
 * - tempvc.delete_request → show confirmation
 * - tempvc.rename        → show rename modal
 * - tempvc.invite        → create invite link
 * - tempvc.ban_menu      → show user select menu
 * - tempvc.ban_user      → execute ban from select
 * - tempvc.limit         → show user limit modal
 * - tempvc.lock_toggle   → toggle lock state
 */

import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type UserSelectMenuInteraction,
  type VoiceChannel,
  type MessageCreateOptions,
} from "discord.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import type { TempVCService } from "./TempVCService.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("tempvc:interactions");

export class TempVCInteractionHandler {
  private client: HeimdallClient;
  private service: TempVCService;
  private lib: LibAPI;

  constructor(client: HeimdallClient, service: TempVCService, lib: LibAPI) {
    this.client = client;
    this.service = service;
    this.lib = lib;
  }

  /**
   * Register all persistent handlers with ComponentCallbackService.
   * Must be called once during plugin load.
   */
  async initialize(): Promise<void> {
    const cbs = this.lib.componentCallbackService;

    cbs.registerPersistentHandler("tempvc.delete_request", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleDeleteRequest(interaction);
    });

    cbs.registerPersistentHandler("tempvc.rename", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleRenameModal(interaction);
    });

    cbs.registerPersistentHandler("tempvc.invite_menu", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleInviteMenu(interaction);
    });

    cbs.registerPersistentHandler("tempvc.invite_user", async (interaction) => {
      if (!interaction.isUserSelectMenu()) return;
      await this.handleInviteUserSelect(interaction);
    });

    cbs.registerPersistentHandler("tempvc.ban_menu", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleBanMenu(interaction);
    });

    cbs.registerPersistentHandler("tempvc.ban_user", async (interaction) => {
      if (!interaction.isUserSelectMenu()) return;
      await this.handleBanUserSelect(interaction);
    });

    cbs.registerPersistentHandler("tempvc.limit", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleLimitModal(interaction);
    });

    cbs.registerPersistentHandler("tempvc.lock_toggle", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleLockToggle(interaction);
    });

    log.info("Registered persistent handlers via ComponentCallbackService");
  }

  // ==================== Control Panel Builder ====================

  /**
   * Build the control panel message for a temp VC.
   * Uses persistent components so buttons work after bot restarts.
   */
  async buildControlPanel(channelId: string, ownerId: string): Promise<MessageCreateOptions> {
    const cbs = this.lib.componentCallbackService;

    const metadata = { channelId, ownerId };
    const deleteId = await cbs.createPersistentComponent("tempvc.delete_request", "button", metadata);
    const renameId = await cbs.createPersistentComponent("tempvc.rename", "button", metadata);
    const inviteId = await cbs.createPersistentComponent("tempvc.invite_menu", "button", metadata);
    const banId = await cbs.createPersistentComponent("tempvc.ban_menu", "button", metadata);
    const limitId = await cbs.createPersistentComponent("tempvc.limit", "button", metadata);
    const lockId = await cbs.createPersistentComponent("tempvc.lock_toggle", "button", metadata);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(deleteId).setLabel("Delete").setStyle(ButtonStyle.Danger).setEmoji("🗑️"),
      new ButtonBuilder().setCustomId(renameId).setLabel("Rename").setStyle(ButtonStyle.Primary).setEmoji("📝"),
      new ButtonBuilder().setCustomId(inviteId).setLabel("Invite").setStyle(ButtonStyle.Success).setEmoji("📨"),
      new ButtonBuilder().setCustomId(banId).setLabel("Ban").setStyle(ButtonStyle.Danger).setEmoji("🔨"),
      new ButtonBuilder().setCustomId(limitId).setLabel("Limit").setStyle(ButtonStyle.Primary).setEmoji("🔢"),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(lockId).setLabel("Lock / Unlock").setStyle(ButtonStyle.Primary).setEmoji("🔒"));

    const embed = this.lib
      .createEmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎉 Welcome to Your Temporary Voice Channel!")
      .setDescription(
        `**Channel Owner:** <@${ownerId}>\n` +
          `**Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
          `**🔧 Quick Setup Tips:**\n` +
          `• Right-click the channel name to change settings manually\n` +
          `• Use the buttons below for quick actions\n` +
          `• Channel will be automatically deleted when empty`,
      )
      .addFields(
        { name: "🗑️ Delete Channel", value: "Permanently remove this channel with confirmation", inline: false },
        { name: "📝 Rename Channel", value: "Change the channel name to something custom", inline: false },
        { name: "📨 Invite Users", value: "Select users to invite to this channel", inline: false },
        { name: "🔨 Ban Users", value: "Remove and ban specific users from this channel", inline: false },
        { name: "🔢 Set User Limit", value: "Configure maximum number of users allowed", inline: false },
        { name: "🔒 Lock/Unlock Channel", value: "Toggle public channel access", inline: false },
      )
      .setFooter({ text: "This channel will auto-delete when empty" })
      .setTimestamp();

    return {
      content: `<@${ownerId}>`,
      embeds: [embed],
      components: [row1, row2],
    };
  }

  // ==================== Interaction Handlers ====================

  /**
   * Delete request — show ephemeral confirmation
   */
  private async handleDeleteRequest(interaction: ButtonInteraction): Promise<void> {
    try {
      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const channelId = metadata?.channelId as string | undefined;
      const ownerId = metadata?.ownerId as string | undefined;
      if (!channelId) {
        await interaction.reply({ content: "❌ Channel information not found.", ephemeral: true });
        return;
      }

      if (!interaction.guild) {
        await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        await interaction.reply({ content: "❌ Channel not found or was deleted.", ephemeral: true });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      const cbs = this.lib.componentCallbackService;

      // Ephemeral confirm/cancel buttons (5 min TTL)
      const confirmId = await cbs.register(async (i) => {
        if (!i.isButton()) return;
        await this.executeDelete(i, channelId, ownerId);
      }, 300);

      const cancelId = await cbs.register(async (i) => {
        if (!i.isButton()) return;
        await i.update({ content: "❌ Channel deletion cancelled.", components: [] }).catch(() => {});
      }, 300);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel("Yes, Delete").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      );

      await interaction.reply({
        content: "⚠️ Are you sure you want to delete this channel? This action cannot be undone.",
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      log.error("Error in handleDeleteRequest:", error);
      await this.sendError(interaction, "Failed to show confirmation dialog.");
    }
  }

  /**
   * Execute channel deletion after confirmation
   */
  private async executeDelete(interaction: ButtonInteraction, channelId: string, ownerId?: string): Promise<void> {
    try {
      await interaction.deferUpdate();
      if (!interaction.guild) {
        await interaction.editReply({ content: "❌ This command can only be used in a server.", components: [] });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (channel && !(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      await this.service.deleteTempChannel(channelId, interaction.guild.id);

      try {
        await interaction.editReply({ content: "✅ Channel deleted successfully!", components: [] });
      } catch {
        // Channel gone — message may be gone too
        log.debug("Channel deleted, interaction message auto-removed by Discord");
      }
    } catch (error) {
      log.error("Error in executeDelete:", error);
      try {
        await interaction.editReply({ content: "❌ Failed to delete channel.", components: [] });
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Rename modal
   */
  private async handleRenameModal(interaction: ButtonInteraction): Promise<void> {
    try {
      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const channelId = metadata?.channelId as string | undefined;
      const ownerId = metadata?.ownerId as string | undefined;
      if (!channelId || !interaction.guild) {
        await interaction.reply({ content: "❌ Channel information not found.", ephemeral: true });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        await interaction.reply({ content: "❌ Channel not found or was deleted.", ephemeral: true });
        return;
      }

      const botMember = interaction.guild.members.me;
      if (!botMember || !channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ content: "❌ I don't have permission to manage this channel.", ephemeral: true });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      const modalId = `tempvc_rename_${channelId}_${Date.now()}`;
      const modal = new ModalBuilder().setCustomId(modalId).setTitle("Rename Your Channel");

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("tempvc_name_input").setLabel("Enter the new name").setMinLength(1).setMaxLength(100).setStyle(TextInputStyle.Short).setPlaceholder(channel.name),
        ),
      );

      await interaction.showModal(modal);

      const modalSubmit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 120_000,
      });

      await this.handleRenameSubmit(modalSubmit, channelId, ownerId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("time")) {
        log.debug("Rename modal timed out");
      } else {
        log.error("Error in handleRenameModal:", error);
        await this.sendError(interaction, "Failed to show rename dialog.");
      }
    }
  }

  /**
   * Process rename modal submission
   */
  private async handleRenameSubmit(interaction: ModalSubmitInteraction, channelId: string, ownerId?: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      if (!interaction.guild) {
        await interaction.editReply({ content: "❌ This command can only be used in a server." });
        return;
      }

      const newName = interaction.fields.getTextInputValue("tempvc_name_input").trim();
      if (!newName) {
        await interaction.editReply({ content: "❌ Channel name cannot be empty." });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        await interaction.editReply({ content: "❌ Channel not found or was deleted." });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      await this.service.renameTempChannel(channel, newName);
      await interaction.editReply({ content: `✅ Channel renamed to **${newName}**!` });
    } catch (error) {
      log.error("Error in handleRenameSubmit:", error);
      await this.sendError(interaction, "Failed to rename channel.");
    }
  }

  /**
   * Show invite user select menu
   */
  private async handleInviteMenu(interaction: ButtonInteraction): Promise<void> {
    try {
      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const channelId = metadata?.channelId as string | undefined;
      const ownerId = metadata?.ownerId as string | undefined;
      if (!channelId || !interaction.guild) {
        await interaction.reply({ content: "❌ Channel information not found.", ephemeral: true });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        await interaction.reply({ content: "❌ Channel not found or was deleted.", ephemeral: true });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel as VoiceChannel, ownerId))) {
        return;
      }

      const selectId = await this.lib.componentCallbackService.createPersistentComponent("tempvc.invite_user", "selectMenu", { channelId, ownerId });

      const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId(selectId).setPlaceholder("Select users to invite").setMinValues(1).setMaxValues(25),
      );

      await interaction.reply({
        content: "📨 **Invite Users**\n\nSelect users to invite to this voice channel. They will be granted access to view and connect.",
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      log.error("Error in handleInviteMenu:", error);
      await this.sendError(interaction, "Failed to show invite menu.");
    }
  }

  /**
   * Execute invite from user select
   */
  private async handleInviteUserSelect(interaction: UserSelectMenuInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const channelId = metadata?.channelId as string | undefined;
      const ownerId = metadata?.ownerId as string | undefined;
      if (!channelId || !interaction.guild) {
        await interaction.editReply({ content: "❌ Channel information not found." });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        await interaction.editReply({ content: "❌ Channel not found or was deleted." });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      const userIds = interaction.values;
      if (!userIds.length) {
        await interaction.editReply({ content: "❌ No users selected." });
        return;
      }

      // Look up opener config to check sendInviteDM setting
      const openerConfig = await this.service.getOpenerConfig(interaction.guild.id, channelId);
      const sendDM = openerConfig?.sendInviteDM ?? false;

      const { invited, failed } = await this.service.inviteUsers(channel, userIds, sendDM);

      const parts: string[] = [];
      if (invited.length) {
        parts.push(`✅ Invited ${invited.length} user${invited.length !== 1 ? "s" : ""}: ${invited.map((id) => `<@${id}>`).join(", ")}`);
      }
      if (failed.length) {
        parts.push(`❌ Failed to invite ${failed.length} user${failed.length !== 1 ? "s" : ""}: ${failed.map((id) => `<@${id}>`).join(", ")}`);
      }
      if (sendDM && invited.length) {
        parts.push(`📨 DM notifications sent to invited users`);
      }

      await interaction.editReply({ content: parts.join("\n") || "❌ No users were invited." });
    } catch (error) {
      log.error("Error in handleInviteUserSelect:", error);
      await this.sendError(interaction, "Failed to invite users.");
    }
  }

  /**
   * Show ban user select menu
   */
  private async handleBanMenu(interaction: ButtonInteraction): Promise<void> {
    try {
      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const channelId = metadata?.channelId as string | undefined;
      const ownerId = metadata?.ownerId as string | undefined;
      if (!channelId || !interaction.guild) {
        await interaction.reply({ content: "❌ Channel information not found.", ephemeral: true });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        await interaction.reply({ content: "❌ Channel not found or was deleted.", ephemeral: true });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel as VoiceChannel, ownerId))) {
        return;
      }

      const selectId = await this.lib.componentCallbackService.createPersistentComponent("tempvc.ban_user", "selectMenu", { channelId, ownerId });

      const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId(selectId).setPlaceholder("Select a user to ban from this channel").setMinValues(1).setMaxValues(1),
      );

      await interaction.reply({
        content: "🔨 **Ban User from Channel**\n\nSelect a user to ban from this voice channel. They will be disconnected and unable to join.",
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      log.error("Error in handleBanMenu:", error);
      await this.sendError(interaction, "Failed to show ban menu.");
    }
  }

  /**
   * Execute ban from user select
   */
  private async handleBanUserSelect(interaction: UserSelectMenuInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const channelId = metadata?.channelId as string | undefined;
      const ownerId = metadata?.ownerId as string | undefined;
      if (!channelId || !interaction.guild) {
        await interaction.editReply({ content: "❌ Channel information not found." });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        await interaction.editReply({ content: "❌ Channel not found or was deleted." });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      const targetUserId = interaction.values[0];
      if (!targetUserId) {
        await interaction.editReply({ content: "❌ No user selected." });
        return;
      }

      if (ownerId && targetUserId === ownerId) {
        await interaction.editReply({ content: "❌ You can't ban the channel owner from their own Temp VC." });
        return;
      }

      const targetUser = await this.lib.thingGetter.getUser(targetUserId);
      if (!targetUser) {
        await interaction.editReply({ content: "❌ User not found." });
        return;
      }

      await this.service.banUserFromChannel(channel, targetUserId);
      await interaction.editReply({ content: `✅ **${targetUser.username}** has been banned from this channel.` });
    } catch (error) {
      log.error("Error in handleBanUserSelect:", error);
      await this.sendError(interaction, "Failed to ban user.");
    }
  }

  /**
   * Show user limit modal
   */
  private async handleLimitModal(interaction: ButtonInteraction): Promise<void> {
    try {
      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const channelId = metadata?.channelId as string | undefined;
      const ownerId = metadata?.ownerId as string | undefined;
      if (!channelId || !interaction.guild) {
        await interaction.reply({ content: "❌ Channel information not found.", ephemeral: true });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        await interaction.reply({ content: "❌ Channel not found or was deleted.", ephemeral: true });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      const modalId = `tempvc_limit_${channelId}_${Date.now()}`;
      const modal = new ModalBuilder().setCustomId(modalId).setTitle("Set User Limit");

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("tempvc_limit_input")
            .setLabel("Enter user limit (0 for no limit)")
            .setMinLength(1)
            .setMaxLength(2)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(channel.userLimit?.toString() || "0"),
        ),
      );

      await interaction.showModal(modal);

      const modalSubmit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 120_000,
      });

      await this.handleLimitSubmit(modalSubmit, channelId, ownerId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("time")) {
        log.debug("Limit modal timed out");
      } else {
        log.error("Error in handleLimitModal:", error);
        await this.sendError(interaction, "Failed to show limit dialog.");
      }
    }
  }

  /**
   * Process limit modal submission
   */
  private async handleLimitSubmit(interaction: ModalSubmitInteraction, channelId: string, ownerId?: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      if (!interaction.guild) {
        await interaction.editReply({ content: "❌ This command can only be used in a server." });
        return;
      }

      const limitText = interaction.fields.getTextInputValue("tempvc_limit_input");
      const limit = parseInt(limitText, 10);

      if (isNaN(limit) || limit < 0 || limit > 99) {
        await interaction.editReply({ content: "❌ Invalid limit. Please enter a number between 0 and 99." });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        await interaction.editReply({ content: "❌ Channel not found or was deleted." });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      await this.service.setUserLimit(channel, limit);

      const display = limit === 0 ? "no limit" : `${limit} users`;
      await interaction.editReply({ content: `✅ User limit set to **${display}**!` });
    } catch (error) {
      log.error("Error in handleLimitSubmit:", error);
      await this.sendError(interaction, "Failed to set user limit.");
    }
  }

  /**
   * Toggle lock/unlock
   */
  private async handleLockToggle(interaction: ButtonInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const channelId = metadata?.channelId as string | undefined;
      const ownerId = this.resolveOwnerIdForControlPanel(interaction, metadata?.ownerId as string | undefined);
      if (!channelId || !interaction.guild) {
        await interaction.editReply({ content: "❌ Channel information not found." });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        await interaction.editReply({ content: "❌ Channel not found or was deleted." });
        return;
      }

      if (!(await this.ensureCanManageChannel(interaction, channel, ownerId))) {
        return;
      }

      const everyoneRole = interaction.guild.roles.everyone;
      const perms = channel.permissionOverwrites.cache.get(everyoneRole.id);
      const isLocked = perms?.deny.has(PermissionFlagsBits.Connect) ?? false;

      await this.service.lockTempChannel(channel, !isLocked, ownerId);

      const statusText = !isLocked ? "🔒 locked" : "🔓 unlocked";
      await interaction.editReply({ content: `✅ Channel is now **${statusText}**!` });
    } catch (error) {
      log.error("Error in handleLockToggle:", error);
      await this.sendError(interaction, "Failed to toggle lock.");
    }
  }

  // ==================== Helpers ====================

  /**
   * Send error message, handling both replied and non-replied states
   */
  private async sendError(interaction: ButtonInteraction | ModalSubmitInteraction | UserSelectMenuInteraction, message: string): Promise<void> {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: `❌ ${message}` });
      } else {
        await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
      }
    } catch {
      log.error("Failed to send error message");
    }
  }

  /**
   * Temp VC control actions are restricted to either:
   * - The original channel owner, OR
   * - Anyone with ManageChannels in that specific channel
   */
  private async ensureCanManageChannel(interaction: ButtonInteraction | ModalSubmitInteraction | UserSelectMenuInteraction, channel: VoiceChannel, ownerId?: string): Promise<boolean> {
    const actorId = interaction.user.id;
    const isOwner = ownerId === actorId;

    let hasManageChannels = false;
    if (!isOwner) {
      const member = channel.guild.members.cache.get(actorId) ?? (await channel.guild.members.fetch(actorId).catch(() => null));
      hasManageChannels = member ? (channel.permissionsFor(member)?.has(PermissionFlagsBits.ManageChannels) ?? false) : false;
    }

    if (isOwner || hasManageChannels) {
      return true;
    }

    const content = "❌ Only the channel owner or members with Manage Channels permission can use Temp VC controls.";
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
    return false;
  }

  /**
   * Resolve channel owner for control panel interactions.
   * Primary source is persistent component metadata; fallback is the panel message mention.
   */
  private resolveOwnerIdForControlPanel(interaction: ButtonInteraction, metadataOwnerId?: string): string | undefined {
    if (metadataOwnerId) {
      return metadataOwnerId;
    }

    const content = interaction.message?.content ?? "";
    const mention = content.match(/<@!?(\d+)>/);
    if (mention?.[1]) {
      return mention[1];
    }

    return undefined;
  }
}
