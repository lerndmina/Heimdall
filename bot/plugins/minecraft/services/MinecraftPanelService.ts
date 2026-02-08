/**
 * MinecraftPanelService — Handles the persistent "Minecraft Linking" panel
 *
 * Posts a public embed with persistent buttons that let users:
 * - 🔗 Link Account — Opens a modal to enter their Minecraft username
 * - 📋 My Status — Shows their current linking/whitelist status ephemerally
 * - ❌ Unlink Account — Lets them unlink one of their linked accounts
 *
 * Similar to the modmail "Contact Support" button pattern.
 */

import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Interaction,
  type StringSelectMenuInteraction,
  type TextChannel,
} from "discord.js";
import type { LibAPI } from "../../lib/index.js";
import type { ComponentCallbackService } from "../../../src/core/services/ComponentCallbackService.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { nanoid } from "nanoid";

export class MinecraftPanelService {
  constructor(
    private lib: LibAPI,
    private componentCallbackService: ComponentCallbackService,
    private logger: PluginLogger,
  ) {}

  /**
   * Register all persistent handlers. Called once during plugin load.
   */
  initialize(): void {
    // ─── LINK ACCOUNT ────────────────────────────────────────────
    this.componentCallbackService.registerPersistentHandler("minecraft.link", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleLinkButton(interaction);
    });

    // ─── MY STATUS ───────────────────────────────────────────────
    this.componentCallbackService.registerPersistentHandler("minecraft.status", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleStatusButton(interaction);
    });

    // ─── UNLINK ACCOUNT ──────────────────────────────────────────
    this.componentCallbackService.registerPersistentHandler("minecraft.unlink", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleUnlinkButton(interaction);
    });

    // ─── UNLINK SELECT (account chooser) ─────────────────────────
    this.componentCallbackService.registerPersistentHandler("minecraft.unlink.select", async (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      await this.handleUnlinkSelect(interaction);
    });

    this.logger.debug("✅ Minecraft panel persistent handlers registered");
  }

  /**
   * Build and send the Minecraft linking panel embed + buttons to a channel.
   */
  async sendPanel(channelId: string, guildId: string, serverName?: string): Promise<{ success: boolean; messageUrl?: string; error?: string }> {
    try {
      const config = await MinecraftConfig.findOne({ guildId }).lean();
      if (!config?.enabled) {
        return { success: false, error: "Minecraft integration is not enabled. Configure it first." };
      }

      // We need to fetch the channel via the lib's thingGetter
      const channel = await this.lib.thingGetter.getChannel(channelId);
      if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        return { success: false, error: "Invalid text channel." };
      }

      const targetChannel = channel as TextChannel;
      const displayName = serverName || config.serverName || "Minecraft Server";

      // Build the embed
      const embed = this.lib
        .createEmbedBuilder()
        .setTitle("🎮 Minecraft Account Linking")
        .setDescription(
          `Link your Discord account to your Minecraft account to get whitelisted on **${displayName}**!\n\n` +
            `**How it works:**\n` +
            `1. Click **Link Account** and enter your Minecraft username\n` +
            `2. Join the Minecraft server — you'll be shown an auth code\n` +
            `3. Use \`/confirm-code <code>\` here in Discord to complete linking\n` +
            (config.autoWhitelist
              ? `4. ✅ You'll be **automatically whitelisted!**\n`
              : config.requireApproval
                ? `4. ⏳ Staff will review and approve your request\n`
                : `4. ⏳ Your whitelist request will be processed\n`) +
            `\n**Server Address:** \`${config.serverHost}:${config.serverPort}\`` +
            (config.maxPlayersPerUser > 1 ? `\n💡 You can link up to **${config.maxPlayersPerUser}** Minecraft accounts.` : ""),
        )
        .setColor(0x5865f2)
        .setFooter({ text: `${displayName} • Minecraft Account Linking` });

      // Build persistent buttons
      const linkBtn = this.lib.createButtonBuilderPersistent("minecraft.link", { guildId });
      linkBtn.setLabel("Link Account").setEmoji("🔗").setStyle(ButtonStyle.Primary);
      await linkBtn.ready();

      const statusBtn = this.lib.createButtonBuilderPersistent("minecraft.status", { guildId });
      statusBtn.setLabel("My Status").setEmoji("📋").setStyle(ButtonStyle.Secondary);
      await statusBtn.ready();

      const unlinkBtn = this.lib.createButtonBuilderPersistent("minecraft.unlink", { guildId });
      unlinkBtn.setLabel("Unlink Account").setEmoji("❌").setStyle(ButtonStyle.Danger);
      await unlinkBtn.ready();

      const row = new ActionRowBuilder<any>().addComponents(linkBtn, statusBtn, unlinkBtn);
      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      // Store the panel location in config
      await MinecraftConfig.updateOne({ guildId }, { linkPanelChannelId: channelId, linkPanelMessageId: message.id });

      return { success: true, messageUrl: message.url };
    } catch (error) {
      this.logger.error("Failed to send Minecraft panel:", error);
      return { success: false, error: "Failed to send panel. Check bot permissions." };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // BUTTON HANDLERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Link Account button — opens a modal for the user's Minecraft username,
   * then creates a pending auth record.
   */
  private async handleLinkButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const discordId = interaction.user.id;

    // Pre-check config
    const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();
    if (!mcConfig?.enabled) {
      await interaction.reply({ content: "❌ Minecraft linking is not currently enabled.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Check account limit before showing modal
    const maxAccounts = mcConfig.maxPlayersPerUser ?? 1;
    const linkedCount = await MinecraftPlayer.countDocuments({ guildId, discordId, linkedAt: { $ne: null } });
    if (linkedCount >= maxAccounts) {
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ Account Limit Reached")
        .setDescription(
          `You've reached the maximum of **${maxAccounts}** linked account${maxAccounts > 1 ? "s" : ""}.\n\n` +
            `Click **Unlink Account** to remove one, or use \`/minecraft-status\` to see your accounts.`,
        );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Check for existing pending
    const existingPending = await MinecraftPlayer.findOne({
      guildId,
      discordId,
      authCode: { $ne: null },
      linkedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (existingPending) {
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xffff00)
        .setTitle("⏳ Pending Request")
        .setDescription(
          `You already have a pending link request for **${existingPending.minecraftUsername}**.\n\n` +
            `**To complete linking:**\n` +
            `1. Join the Minecraft server: \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n` +
            `2. You'll see your authentication code\n` +
            `3. Use \`/confirm-code <code>\` here in Discord\n\n` +
            `**Expires:** <t:${Math.floor((existingPending.expiresAt?.getTime() || Date.now()) / 1000)}:R>\n\n` +
            `*Click **Link Account** again after it expires to start a new request.*`,
        );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Show username input modal
    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Link Minecraft Account");

    const usernameInput = new TextInputBuilder()
      .setCustomId("username")
      .setLabel("Your Minecraft Username")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("e.g. Steve")
      .setMinLength(3)
      .setMaxLength(16);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput));

    await interaction.showModal(modal);

    try {
      const submit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === discordId && i.customId === modalId,
        time: 300_000, // 5 minutes
      });

      await submit.deferReply({ flags: MessageFlags.Ephemeral });

      const minecraftUsername = submit.fields.getTextInputValue("username").trim();

      // Validate
      if (!/^[a-zA-Z0-9_]{3,16}$/.test(minecraftUsername)) {
        const embed = this.lib
          .createEmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Invalid Username")
          .setDescription("Minecraft usernames must be 3–16 characters and contain only letters, numbers, and underscores.");
        await submit.editReply({ embeds: [embed] });
        return;
      }

      // Check if MC username already taken by a different user
      const taken = await MinecraftPlayer.findOne({
        guildId,
        minecraftUsername: { $regex: new RegExp(`^${minecraftUsername}$`, "i") },
        discordId: { $ne: null, $nin: [discordId] },
        linkedAt: { $ne: null },
      }).lean();

      if (taken) {
        const embed = this.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Username Taken").setDescription(`**${minecraftUsername}** is already linked to another Discord account.`);
        await submit.editReply({ embeds: [embed] });
        return;
      }

      // Check if already linked same username
      const alreadyLinked = await MinecraftPlayer.findOne({
        guildId,
        discordId,
        minecraftUsername: { $regex: new RegExp(`^${minecraftUsername}$`, "i") },
        linkedAt: { $ne: null },
      }).lean();

      if (alreadyLinked) {
        const embed = this.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Already Linked").setDescription(`You're already linked to **${alreadyLinked.minecraftUsername}**.`);
        await submit.editReply({ embeds: [embed] });
        return;
      }

      // Clean up expired pending auths
      await MinecraftPlayer.deleteMany({
        guildId,
        discordId,
        authCode: { $ne: null },
        linkedAt: null,
        expiresAt: { $lte: new Date() },
      }).catch(() => {});

      // Generate auth code
      let authCode = "";
      for (let i = 0; i < 10; i++) {
        authCode = Math.floor(100000 + Math.random() * 900000).toString();
        const exists = await MinecraftPlayer.exists({ authCode });
        if (!exists) break;
      }

      const expiresAt = new Date(Date.now() + (mcConfig.authCodeExpiry || 300) * 1000);
      const member = await interaction.guild?.members.fetch(discordId).catch(() => null);

      // Upsert — if an unclaimed record already exists, update it instead of failing on duplicate key
      await MinecraftPlayer.findOneAndUpdate(
        {
          guildId,
          minecraftUsername: { $regex: new RegExp(`^${minecraftUsername}$`, "i") },
        },
        {
          $set: {
            discordId,
            authCode,
            expiresAt,
            codeShownAt: undefined,
            linkedAt: undefined,
            discordUsername: interaction.user.username,
            discordDisplayName: member?.displayName || interaction.user.globalName || interaction.user.username,
            source: "linked",
          },
        },
        { upsert: true, new: true },
      );

      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🎮 Link Request Created!")
        .setDescription(
          `**Next steps:**\n` +
            `1. Join the Minecraft server: \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n` +
            `2. You'll be shown your authentication code\n` +
            `3. Come back here and use \`/confirm-code <your-code>\`\n\n` +
            (mcConfig.autoWhitelist
              ? `✅ You'll be automatically whitelisted once confirmed!`
              : mcConfig.requireApproval
                ? `⏳ After confirming, staff will review and approve your request.`
                : `⏳ After confirming, your whitelist request will be processed.`) +
            `\n\n**Request expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
        )
        .setFooter({ text: `Linking as: ${minecraftUsername}` });

      await submit.editReply({ embeds: [embed] });
    } catch {
      // Modal timed out — that's fine
    }
  }

  /**
   * My Status button — shows ephemeral status embed with all linked accounts.
   */
  private async handleStatusButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const discordId = interaction.user.id;
    const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();

    if (!mcConfig?.enabled) {
      await interaction.editReply("❌ Minecraft linking is not currently enabled.");
      return;
    }

    const linkedPlayers = await MinecraftPlayer.find({ guildId, discordId, linkedAt: { $ne: null } })
      .sort({ linkedAt: 1 })
      .lean();

    const pendingAuth = await MinecraftPlayer.findOne({
      guildId,
      discordId,
      authCode: { $ne: null },
      linkedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();

    const maxAccounts = mcConfig.maxPlayersPerUser ?? 1;

    if (linkedPlayers.length === 0 && !pendingAuth) {
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("❓ No Accounts Linked")
        .setDescription(
          "You don't have any Minecraft accounts linked.\n\n" + `Click **Link Account** to get started!` + (maxAccounts > 1 ? `\n💡 You can link up to **${maxAccounts}** accounts.` : ""),
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = this.lib.createEmbedBuilder().setTitle("🎮 Your Minecraft Accounts").setColor(0x5865f2);

    if (linkedPlayers.length > 0) {
      for (const player of linkedPlayers) {
        const isWhitelisted = !!player.whitelistedAt && !player.revokedAt;
        const statusEmoji = player.revokedAt ? "🔴" : isWhitelisted ? "🟢" : "🟡";
        const statusText = player.revokedAt ? "Revoked" : isWhitelisted ? "Whitelisted" : "Pending Approval";

        embed.addFields({
          name: `${statusEmoji} ${player.minecraftUsername}`,
          value:
            `**Status:** ${statusText}\n` +
            `**Linked:** <t:${Math.floor(new Date(player.linkedAt!).getTime() / 1000)}:R>` +
            (isWhitelisted ? `\n**Whitelisted:** <t:${Math.floor(new Date(player.whitelistedAt!).getTime() / 1000)}:R>` : ""),
          inline: linkedPlayers.length <= 3,
        });
      }
    }

    if (pendingAuth) {
      embed.addFields({
        name: "🔄 Pending Link Request",
        value:
          `**Username:** ${pendingAuth.minecraftUsername}\n` +
          `**Expires:** <t:${Math.floor((pendingAuth.expiresAt?.getTime() || 0) / 1000)}:R>\n` +
          (pendingAuth.codeShownAt
            ? `**Code:** \`${pendingAuth.authCode}\` — Use \`/confirm-code ${pendingAuth.authCode}\``
            : `Join \`${mcConfig.serverHost}:${mcConfig.serverPort}\` to get your code`),
        inline: false,
      });
    }

    let footer = `Server: ${mcConfig.serverHost}:${mcConfig.serverPort}`;
    if (maxAccounts > 1) {
      footer += ` • ${linkedPlayers.length}/${maxAccounts} slots used`;
    }
    embed.setFooter({ text: footer });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Unlink Account button — shows a select menu if multiple accounts,
   * or a confirmation prompt if only one account.
   * Blocked when allowSelfUnlink is disabled in config.
   */
  private async handleUnlinkButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Check if self-unlink is allowed
    const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();
    if (mcConfig && mcConfig.allowSelfUnlink === false) {
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔒 Unlinking Requires Staff Approval")
        .setDescription("Self-unlinking is disabled on this server. Please contact a staff member to unlink your account.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const discordId = interaction.user.id;
    const linkedPlayers = await MinecraftPlayer.find({ guildId, discordId, linkedAt: { $ne: null } })
      .sort({ linkedAt: 1 })
      .lean();

    if (linkedPlayers.length === 0) {
      const embed = this.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ No Accounts to Unlink").setDescription("You don't have any linked Minecraft accounts.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (linkedPlayers.length === 1) {
      // Single account — show inline confirmation
      const player = linkedPlayers[0]!;
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("⚠️ Unlink Account")
        .setDescription(`Are you sure you want to unlink **${player.minecraftUsername}**?\n\n` + `This will remove your whitelist and you won't be able to join the server until you re-link.`);

      const confirmBtn = this.lib.createButtonBuilder(async (i) => {
        await MinecraftPlayer.findByIdAndDelete(player._id);
        const doneEmbed = this.lib
          .createEmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ Account Unlinked")
          .setDescription(`**${player.minecraftUsername}** has been unlinked from your Discord account.\n\nClick **Link Account** to link a new account.`);
        await i.update({ embeds: [doneEmbed], components: [] });
      }, 120);
      confirmBtn.setLabel("Yes, Unlink").setStyle(ButtonStyle.Danger);
      await confirmBtn.ready();

      const cancelBtn = this.lib.createButtonBuilder(async (i) => {
        await i.update({ content: "Cancelled.", embeds: [], components: [] });
      }, 120);
      cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
      await cancelBtn.ready();

      const row = new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn);
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    // Multiple accounts — show select menu
    const embed = this.lib.createEmbedBuilder().setColor(0xff0000).setTitle("⚠️ Unlink Account").setDescription("Select which Minecraft account you want to unlink:");

    const select = this.lib.createStringSelectMenuBuilder(async (i) => {
      const playerId = i.values[0];
      if (!playerId) return;

      const doc = await MinecraftPlayer.findById(playerId);
      if (!doc || doc.discordId !== discordId) {
        await i.update({ content: "❌ Account not found.", embeds: [], components: [] });
        return;
      }

      const playerUsername = doc.minecraftUsername;

      // Show confirmation
      const confirmEmbed = this.lib.createEmbedBuilder().setColor(0xff0000).setTitle("⚠️ Confirm Unlink").setDescription(`Unlink **${playerUsername}**? This will remove your whitelist.`);

      const confirmBtn = this.lib.createButtonBuilder(async (ci) => {
        await MinecraftPlayer.findByIdAndDelete(doc._id);

        const doneEmbed = this.lib
          .createEmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ Account Unlinked")
          .setDescription(`**${playerUsername}** has been unlinked.\n\nClick **Link Account** to link a new account.`);
        await ci.update({ embeds: [doneEmbed], components: [] });
      }, 120);
      confirmBtn.setLabel("Confirm Unlink").setStyle(ButtonStyle.Danger);
      await confirmBtn.ready();

      const cancelBtn = this.lib.createButtonBuilder(async (ci) => {
        await ci.update({ content: "Cancelled.", embeds: [], components: [] });
      }, 120);
      cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
      await cancelBtn.ready();

      const confirmRow = new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn);
      await i.update({ embeds: [confirmEmbed], components: [confirmRow] });
    }, 300);

    select.setPlaceholder("Select an account to unlink");
    for (const player of linkedPlayers.slice(0, 25)) {
      const isWhitelisted = !!player.whitelistedAt && !player.revokedAt;
      select.addOptions({
        label: player.minecraftUsername,
        value: player._id.toString(),
        description: isWhitelisted ? "🟢 Whitelisted" : player.revokedAt ? "🔴 Revoked" : "🟡 Pending",
        emoji: isWhitelisted ? "🟢" : player.revokedAt ? "🔴" : "🟡",
      });
    }
    await select.ready();

    const row = new ActionRowBuilder<any>().addComponents(select);
    await interaction.editReply({ embeds: [embed], components: [row] });
  }

  /**
   * Unlink select handler — for the persistent select menu pattern (not currently used,
   * but registered for future use if needed).
   */
  private async handleUnlinkSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    // Currently handled inline via ephemeral select in handleUnlinkButton
    await interaction.deferUpdate();
  }
}
