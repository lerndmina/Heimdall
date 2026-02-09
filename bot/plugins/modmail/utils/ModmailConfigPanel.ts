/**
 * ModmailConfigPanel - Interactive single-message configurator panel
 *
 * Replaces the argument-based `/modmail config` and `/modmail category *` subcommands
 * with a unified visual panel. Uses ephemeral Heimdall builders for buttons/selects,
 * Discord modals for text input, and auto-saves on every interaction.
 *
 * Views:
 * - Home          — Dashboard overview with quick nav
 * - Global Settings — Thread naming, rate limits, staff roles, limits modal
 * - Category List   — Select/create/manage categories
 * - Category Detail  — Edit name/desc/emoji, toggle, delete, staff, form editor
 * - Form Editor     — List fields, add/edit/delete
 * - Field Editor    — Edit field details, manage options (for SELECT type)
 * - Option Editor   — Add/remove select field options
 */

import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ColorResolvable,
  type EmbedField,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type RoleSelectMenuInteraction,
  type ChannelSelectMenuInteraction,
  type ModalSubmitInteraction,
  type RepliableInteraction,
} from "discord.js";
import { nanoid } from "nanoid";
import { InteractionFlow } from "./InteractionFlow.js";
import { ModmailEmbeds, PriorityLabels } from "./ModmailEmbeds.js";
import ModmailConfig, { type IModmailConfig, type ModmailCategory, type FormField, ModmailFormFieldType, TypingIndicatorStyle } from "../models/ModmailConfig.js";
import { createForumTags } from "./forumTagHelper.js";
import type { ModmailPluginAPI } from "../index.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { ForumChannel, TextChannel } from "discord.js";
import { ModmailColors } from "./ModmailEmbeds.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

/** TTL for ephemeral components (15 minutes) */
const COMPONENT_TTL = 900;

/** Any interaction type that can trigger a panel view update */
type PanelInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | RoleSelectMenuInteraction | ChannelSelectMenuInteraction;

/** Priority options for select menus */
const PRIORITY_OPTIONS = [
  { label: "🟢 Low", value: "1" },
  { label: "🟡 Normal", value: "2" },
  { label: "🟠 High", value: "3" },
  { label: "🔴 Urgent", value: "4" },
];

/** Typing indicator style options */
const TYPING_STYLE_OPTIONS = [
  { label: "Native (typing...)", value: TypingIndicatorStyle.NATIVE },
  { label: "Message embed", value: TypingIndicatorStyle.MESSAGE },
  { label: "Both", value: TypingIndicatorStyle.BOTH },
];

/** Field type options */
const FIELD_TYPE_OPTIONS = [
  { label: "📝 Short Text", value: ModmailFormFieldType.SHORT, description: "Single-line text input" },
  { label: "📄 Paragraph", value: ModmailFormFieldType.PARAGRAPH, description: "Multi-line text area" },
  { label: "🔽 Select Menu", value: ModmailFormFieldType.SELECT, description: "Dropdown with custom options" },
  { label: "🔢 Number", value: ModmailFormFieldType.NUMBER, description: "Numeric input" },
];

/**
 * Get human-readable label for field type
 */
function getFieldTypeLabel(type: ModmailFormFieldType): string {
  switch (type) {
    case ModmailFormFieldType.SHORT:
      return "Short Text";
    case ModmailFormFieldType.PARAGRAPH:
      return "Paragraph";
    case ModmailFormFieldType.SELECT:
      return "Select Menu";
    case ModmailFormFieldType.NUMBER:
      return "Number";
    default:
      return "Unknown";
  }
}

/**
 * Get emoji for field type
 */
function getFieldTypeEmoji(type: ModmailFormFieldType): string {
  switch (type) {
    case ModmailFormFieldType.SHORT:
      return "📝";
    case ModmailFormFieldType.PARAGRAPH:
      return "📄";
    case ModmailFormFieldType.SELECT:
      return "🔽";
    case ModmailFormFieldType.NUMBER:
      return "🔢";
    default:
      return "❓";
  }
}

/**
 * ModmailConfigPanel — the interactive configurator
 */
export class ModmailConfigPanel {
  private flow: InteractionFlow;
  private guildId: string;

  constructor(
    private interaction: ChatInputCommandInteraction,
    private pluginAPI: ModmailPluginAPI,
    private log: PluginLogger,
  ) {
    this.flow = new InteractionFlow(interaction);
    this.guildId = interaction.guildId!;
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Fetch fresh config from MongoDB (always bypasses cache for mutations)
   */
  private async freshConfig(): Promise<(IModmailConfig & import("mongoose").Document) | null> {
    return ModmailConfig.findOne({ guildId: this.guildId });
  }

  /**
   * Create an ephemeral button with inline callback
   */
  private btn(callback: (i: ButtonInteraction) => Promise<void>) {
    return this.pluginAPI.lib.createButtonBuilder(async (i) => {
      try {
        await callback(i);
      } catch (err) {
        this.log.error("Config panel button error:", err);
        try {
          if (!i.replied && !i.deferred) await i.deferUpdate();
          await i.followUp({ content: "❌ An error occurred. Try again.", flags: MessageFlags.Ephemeral });
        } catch {
          /* already replied */
        }
      }
    }, COMPONENT_TTL);
  }

  /**
   * Create an ephemeral string select with inline callback
   */
  private strSelect(callback: (i: StringSelectMenuInteraction) => Promise<void>) {
    return this.pluginAPI.lib.createStringSelectMenuBuilder(async (i) => {
      try {
        await callback(i);
      } catch (err) {
        this.log.error("Config panel select error:", err);
        try {
          if (!i.replied && !i.deferred) await i.deferUpdate();
          await i.followUp({ content: "❌ An error occurred. Try again.", flags: MessageFlags.Ephemeral });
        } catch {
          /* already replied */
        }
      }
    }, COMPONENT_TTL);
  }

  /**
   * Create an ephemeral role select with inline callback
   */
  private roleSelect(callback: (i: RoleSelectMenuInteraction) => Promise<void>) {
    return this.pluginAPI.lib.createRoleSelectMenuBuilder(async (i) => {
      try {
        await callback(i);
      } catch (err) {
        this.log.error("Config panel role select error:", err);
        try {
          if (!i.replied && !i.deferred) await i.deferUpdate();
          await i.followUp({ content: "❌ An error occurred. Try again.", flags: MessageFlags.Ephemeral });
        } catch {
          /* already replied */
        }
      }
    }, COMPONENT_TTL);
  }

  /**
   * Create an ephemeral channel select with inline callback
   */
  private channelSelect(callback: (i: ChannelSelectMenuInteraction) => Promise<void>) {
    return this.pluginAPI.lib.createChannelSelectMenuBuilder(async (i) => {
      try {
        await callback(i);
      } catch (err) {
        this.log.error("Config panel channel select error:", err);
        try {
          if (!i.replied && !i.deferred) await i.deferUpdate();
          await i.followUp({ content: "❌ An error occurred. Try again.", flags: MessageFlags.Ephemeral });
        } catch {
          /* already replied */
        }
      }
    }, COMPONENT_TTL);
  }

  // ========================================
  // LAUNCH
  // ========================================

  /**
   * Launch the config panel (called from the config subcommand)
   */
  async launch(): Promise<void> {
    const config = await this.freshConfig();
    if (!config) {
      await this.showSetupWizard();
      return;
    }

    await this.showHome(config);
  }

  // ========================================
  // SETUP WIZARD (first-time setup)
  // ========================================

  /**
   * State object to accumulate selections before creating the config.
   * Fields are set by the channel/role selects, then consumed by the Create button.
   */
  private setupState: { forumChannelId?: string; staffRoleId?: string } = {};

  /**
   * Show setup wizard when modmail is not yet configured.
   * Users pick a forum channel and staff role, then click Create.
   */
  private async showSetupWizard(interaction?: PanelInteraction): Promise<void> {
    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("📬 Modmail Setup")
      .setDescription(
        "Welcome! Let's set up modmail for this server.\n\n" +
          "**1.** Select the **forum channel** where modmail threads will be created\n" +
          "**2.** Select the **staff role** that can respond to tickets\n" +
          "**3.** Click **Create** to finish setup",
      )
      .setColor(0x5865f2 as ColorResolvable);

    // Show current selections
    const fields: EmbedField[] = [];
    if (this.setupState.forumChannelId) {
      fields.push({ name: "Forum Channel", value: `<#${this.setupState.forumChannelId}>`, inline: true });
    }
    if (this.setupState.staffRoleId) {
      fields.push({ name: "Staff Role", value: `<@&${this.setupState.staffRoleId}>`, inline: true });
    }
    if (fields.length > 0) embed.addFields(fields);

    // Row 1: Forum channel select
    const channelSelect = this.channelSelect(async (i) => {
      const channelId = i.channels.first()?.id;
      if (channelId) this.setupState.forumChannelId = channelId;
      await this.showSetupWizard(i);
    });
    channelSelect.setPlaceholder("Select a forum channel").setChannelTypes(ChannelType.GuildForum);
    if (this.setupState.forumChannelId) {
      channelSelect.setDefaultChannels(this.setupState.forumChannelId);
    }
    await channelSelect.ready();

    // Row 2: Staff role select
    const roleSelect = this.roleSelect(async (i) => {
      const roleId = i.roles.first()?.id;
      if (roleId) this.setupState.staffRoleId = roleId;
      await this.showSetupWizard(i);
    });
    roleSelect.setPlaceholder("Select a staff role").setMinValues(1).setMaxValues(1);
    if (this.setupState.staffRoleId) {
      roleSelect.setDefaultRoles(this.setupState.staffRoleId);
    }
    await roleSelect.ready();

    // Row 3: Create button
    const canCreate = !!this.setupState.forumChannelId && !!this.setupState.staffRoleId;
    const createBtn = this.btn(async (i) => {
      await this.executeSetup(i);
    });
    createBtn.setLabel("Create").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(!canCreate);
    await createBtn.ready();

    const rows = [new ActionRowBuilder<any>().addComponents(channelSelect), new ActionRowBuilder<any>().addComponents(roleSelect), new ActionRowBuilder<any>().addComponents(createBtn)];

    const payload = { embeds: [embed], components: rows, flags: MessageFlags.Ephemeral };

    if (interaction) {
      await this.flow.update(payload, interaction);
    } else {
      await this.flow.init(payload);
    }
  }

  /**
   * Execute the setup: create config, webhook, forum tags, default category
   */
  private async executeSetup(interaction: ButtonInteraction): Promise<void> {
    const { forumChannelId, staffRoleId } = this.setupState;
    if (!forumChannelId || !staffRoleId) return;

    try {
      // Fetch the forum channel
      const guild = this.interaction.guild!;
      const channel = await guild.channels.fetch(forumChannelId);
      if (!channel || channel.type !== ChannelType.GuildForum) {
        await interaction.followUp({ content: "❌ Invalid forum channel. Please select a forum channel.", flags: MessageFlags.Ephemeral });
        return;
      }
      const forumChannel = channel as ForumChannel;

      // Create webhook
      const webhook = await forumChannel.createWebhook({
        name: "Heimdall Modmail",
        avatar: this.interaction.client.user?.displayAvatarURL(),
        reason: `Modmail setup by ${this.interaction.user.username}`,
      });

      // Encrypt webhook token
      const encryptedToken = ModmailConfig.encryptWebhookToken(webhook.token!, this.pluginAPI.encryptionKey);

      // Create forum tags
      const forumTags = await createForumTags(forumChannel);

      // Generate category ID
      const categoryId = nanoid(12);

      // Create config
      await ModmailConfig.create({
        guildId: this.guildId,
        enabled: true,
        globalStaffRoleIds: [staffRoleId],
        defaultCategoryId: categoryId,
        categories: [
          {
            id: categoryId,
            name: "General Support",
            description: "General support inquiries",
            forumChannelId,
            webhookId: webhook.id,
            encryptedWebhookToken: encryptedToken,
            staffRoleIds: [],
            priority: 2,
            formFields: [],
            resolveAutoCloseHours: 24,
            enabled: true,
            openTagId: forumTags?.openTagId,
            closedTagId: forumTags?.closedTagId,
          },
        ],
        autoCloseHours: 72,
        autoCloseWarningHours: 48,
        minimumMessageLength: 10,
        nextTicketNumber: 1,
        typingIndicators: true,
        typingIndicatorStyle: TypingIndicatorStyle.NATIVE,
        forumTags: forumTags || {},
      });

      this.notifyConfigUpdated();

      this.log.info(`Modmail setup completed for guild ${this.guildId}`);

      // Transition to the config home view
      const config = await this.freshConfig();
      if (config) {
        await this.showHome(config, interaction);
      }
    } catch (error) {
      this.log.error("Modmail setup error:", error);
      await interaction.followUp({
        content: "❌ Setup failed. Check bot permissions (Manage Webhooks) and try again.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private notifyConfigUpdated(): void {
    broadcastDashboardChange(this.guildId, "modmail", "config_updated", { requiredAction: "modmail.manage_config" });
  }

  private async saveConfig(cfg: IModmailConfig & import("mongoose").Document): Promise<void> {
    await cfg.save();
    this.notifyConfigUpdated();
  }

  // ========================================
  // HOME VIEW
  // ========================================

  private async showHome(config: IModmailConfig & import("mongoose").Document, interaction?: PanelInteraction): Promise<void> {
    const categories = config.categories as ModmailCategory[];
    const enabledCount = categories.filter((c) => c.enabled).length;
    const totalFormFields = categories.reduce((sum, c) => sum + (c.formFields?.length || 0), 0);
    const staffRoles = config.globalStaffRoleIds?.map((id: string) => `<@&${id}>`).join(", ") || "None";

    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("⚙️ Modmail Configuration")
      .setDescription("Use the buttons below to configure your modmail system.")
      .setColor(0x5865f2 as ColorResolvable)
      .addFields(
        {
          name: "System Status",
          value: config.enabled ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        },
        {
          name: "Categories",
          value: `${enabledCount}/${categories.length} active`,
          inline: true,
        },
        {
          name: "Form Fields",
          value: `${totalFormFields} total`,
          inline: true,
        },
        {
          name: "Auto-Close",
          value: config.enableAutoClose ? `${config.autoCloseHours}h (warn at ${config.autoCloseWarningHours}h)` : "Disabled",
          inline: true,
        },
        {
          name: "Min Message Length",
          value: `${config.minimumMessageLength} chars`,
          inline: true,
        },
        {
          name: "Staff Roles",
          value: staffRoles,
          inline: true,
        },
        {
          name: "Thread Naming",
          value: `\`${config.threadNamingPattern}\``,
          inline: false,
        },
      );

    // Build navigation buttons
    const globalSettingsBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      await this.showGlobalSettings(cfg, i);
    });
    globalSettingsBtn.setLabel("Global Settings").setEmoji("🔧").setStyle(ButtonStyle.Primary);
    await globalSettingsBtn.ready();

    const categoriesBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      await this.showCategoryList(cfg, i);
    });
    categoriesBtn.setLabel("Categories").setEmoji("📂").setStyle(ButtonStyle.Primary);
    await categoriesBtn.ready();

    const toggleBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      cfg.enabled = !cfg.enabled;
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showHome(cfg, i);
    });
    toggleBtn
      .setLabel(config.enabled ? "Disable System" : "Enable System")
      .setEmoji(config.enabled ? "🔴" : "🟢")
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success);
    await toggleBtn.ready();

    const sendButtonBtn = this.btn(async (i) => {
      await this.showSendButton(i);
    });
    sendButtonBtn.setLabel("Send Contact Button").setEmoji("📬").setStyle(ButtonStyle.Secondary);
    await sendButtonBtn.ready();

    const closeBtn = this.btn(async (i) => {
      if (!i.deferred && !i.replied) await i.deferUpdate();
      await i.deleteReply().catch(() => {});
    });
    closeBtn.setLabel("Close Panel").setEmoji("✖️").setStyle(ButtonStyle.Secondary);
    await closeBtn.ready();

    const row1 = new ActionRowBuilder<any>().addComponents(globalSettingsBtn, categoriesBtn, toggleBtn);
    const row2 = new ActionRowBuilder<any>().addComponents(sendButtonBtn, closeBtn);

    const payload = { embeds: [embed], components: [row1, row2], flags: MessageFlags.Ephemeral };

    if (interaction) {
      await this.flow.update(payload, interaction);
    } else {
      await this.flow.init(payload);
    }
  }

  // ========================================
  // SEND CONTACT BUTTON VIEW
  // ========================================

  /**
   * State for the send-button view — accumulates channel selection before posting.
   */
  private sendButtonState: { channelId?: string } = {};

  /**
   * Show the Send Contact Button view — user picks a channel, optionally customises
   * the title and description via a modal, then posts a persistent contact button.
   */
  private async showSendButton(interaction: PanelInteraction): Promise<void> {
    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("📬 Send Contact Button")
      .setDescription(
        "Post a modmail contact button to a channel so users can open tickets.\n\n" +
          "**1.** Select the **text channel** to post in\n" +
          "**2.** Click **Send** (uses defaults) or **Customize** to set title & description",
      )
      .setColor(0x5865f2 as ColorResolvable);

    if (this.sendButtonState.channelId) {
      embed.addFields({ name: "Target Channel", value: `<#${this.sendButtonState.channelId}>`, inline: true });
    }

    // Row 1: Channel select
    const channelSelect = this.channelSelect(async (i) => {
      const ch = i.channels.first();
      if (ch) this.sendButtonState.channelId = ch.id;
      await this.showSendButton(i);
    });
    channelSelect.setPlaceholder("Select a text channel").setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
    if (this.sendButtonState.channelId) {
      channelSelect.setDefaultChannels(this.sendButtonState.channelId);
    }
    await channelSelect.ready();

    // Row 2: Send (defaults) + Customize + Back
    const canSend = !!this.sendButtonState.channelId;

    const sendBtn = this.btn(async (i) => {
      await this.executeSendButton(i, "📬 Contact Support", "Need help? Click the button below to open a support ticket.\n\nA staff member will respond as soon as possible.");
    });
    sendBtn.setLabel("Send").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(!canSend);
    await sendBtn.ready();

    const customizeBtn = this.btn(async (i) => {
      await this.showSendButtonModal(i);
    });
    customizeBtn.setLabel("Customize & Send").setEmoji("✏️").setStyle(ButtonStyle.Primary).setDisabled(!canSend);
    await customizeBtn.ready();

    const backBtn = this.btn(async (i) => {
      this.sendButtonState = {};
      const cfg = await this.freshConfig();
      if (!cfg) return;
      await this.showHome(cfg, i);
    });
    backBtn.setLabel("Back").setEmoji("⬅️").setStyle(ButtonStyle.Secondary);
    await backBtn.ready();

    const rows = [new ActionRowBuilder<any>().addComponents(channelSelect), new ActionRowBuilder<any>().addComponents(sendBtn, customizeBtn, backBtn)];

    await this.flow.update({ embeds: [embed], components: rows }, interaction);
  }

  /**
   * Open a modal for custom title & description, then execute the send.
   */
  private async showSendButtonModal(interaction: PanelInteraction): Promise<void> {
    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Customize Contact Button");

    const titleInput = new TextInputBuilder().setCustomId("title").setLabel("Embed Title").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("📬 Contact Support").setMaxLength(256);

    const descInput = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Embed Description")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder("Need help? Click the button below to open a support ticket.")
      .setMaxLength(2000);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput), new ActionRowBuilder<TextInputBuilder>().addComponents(descInput));

    await (interaction as ButtonInteraction).showModal(modal);

    try {
      const submit = await (interaction as ButtonInteraction).awaitModalSubmit({
        filter: (i) => i.user.id === this.interaction.user.id && i.customId === modalId,
        time: 900_000,
      });

      const title = submit.fields.getTextInputValue("title") || "📬 Contact Support";
      const description = submit.fields.getTextInputValue("description") || "Need help? Click the button below to open a support ticket.\n\nA staff member will respond as soon as possible.";

      await this.executeSendButton(submit, title, description);
    } catch {
      // Modal timed out — ignore
    }
  }

  /**
   * Actually post the persistent contact button to the selected channel.
   */
  private async executeSendButton(interaction: PanelInteraction, title: string, description: string): Promise<void> {
    const { channelId } = this.sendButtonState;
    if (!channelId) return;

    try {
      const guild = this.interaction.guild!;
      const channel = await guild.channels.fetch(channelId);

      if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        await interaction.followUp({ content: "❌ Invalid text channel.", flags: MessageFlags.Ephemeral });
        return;
      }

      const targetChannel = channel as TextChannel;

      // Build embed
      const embed = this.pluginAPI.lib
        .createEmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(ModmailColors.DEFAULT)
        .setFooter({ text: `${guild.name} Support` });

      // Create persistent contact button
      const contactButton = this.pluginAPI.lib.createButtonBuilderPersistent("modmail.create", {
        guildId: this.interaction.guildId,
      });
      contactButton.setLabel("Contact Support").setEmoji("📬").setStyle(ButtonStyle.Primary);
      await contactButton.ready();

      const row = new ActionRowBuilder<any>().addComponents(contactButton);
      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      // Reset state and go back to home with success feedback
      this.sendButtonState = {};
      const cfg = await this.freshConfig();
      if (cfg) {
        // Show success then home
        const successEmbed = this.pluginAPI.lib
          .createEmbedBuilder()
          .setTitle("✅ Button Posted")
          .setDescription(`The modmail contact button has been posted to <#${channelId}>.\n\n[Jump to message](${message.url})`)
          .setColor(0x57f287 as ColorResolvable);

        await this.flow.update({ embeds: [successEmbed], components: [] }, interaction);

        // After a short delay, return to home
        setTimeout(async () => {
          try {
            const refreshedCfg = await this.freshConfig();
            if (refreshedCfg) await this.showHome(refreshedCfg);
          } catch {
            /* panel may have been dismissed */
          }
        }, 3000);
      }
    } catch (error) {
      this.log.error("Send button error:", error);
      await interaction.followUp({
        content: "❌ Failed to send the contact button. Check bot permissions in the target channel.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // ========================================
  // GLOBAL SETTINGS VIEW
  // ========================================

  private async showGlobalSettings(config: IModmailConfig & import("mongoose").Document, interaction: PanelInteraction): Promise<void> {
    const staffRoles = config.globalStaffRoleIds?.map((id: string) => `<@&${id}>`).join(", ") || "None";

    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("🔧 Global Settings")
      .setDescription("Configure system-wide modmail settings.")
      .setColor(0x5865f2 as ColorResolvable)
      .addFields(
        {
          name: "Thread Naming Pattern",
          value: `\`${config.threadNamingPattern}\`\nVariables: \`{number}\`, \`{username}\`, \`{claimer}\``,
          inline: false,
        },
        {
          name: "Rate Limit",
          value: `${config.rateLimitSeconds}s between messages`,
          inline: true,
        },
        {
          name: "Min Message Length",
          value: `${config.minimumMessageLength} chars`,
          inline: true,
        },
        {
          name: "Global Staff Roles",
          value: staffRoles,
          inline: false,
        },
        {
          name: "Auto-Close",
          value: config.enableAutoClose ? `✅ Enabled — ${config.autoCloseHours}h` : "❌ Disabled",
          inline: true,
        },
        {
          name: "Inactivity Warning",
          value: config.enableInactivityWarning ? `✅ Enabled — ${config.autoCloseWarningHours}h before close` : "❌ Disabled",
          inline: true,
        },
        {
          name: "Typing Indicators",
          value: config.typingIndicators ? `✅ Enabled — ${config.typingIndicatorStyle || "native"}` : "❌ Disabled",
          inline: true,
        },
        {
          name: "Attachments",
          value: config.allowAttachments ? `✅ Allowed — max ${config.maxAttachmentSizeMB}MB` : "❌ Disabled",
          inline: true,
        },
      );

    // Row 1: Edit Limits (modal), Toggle Auto-Close, Toggle Warning
    const editLimitsBtn = this.btn(async (i) => {
      await this.promptEditLimits(i);
    });
    editLimitsBtn.setLabel("Edit Limits").setEmoji("✏️").setStyle(ButtonStyle.Primary);
    await editLimitsBtn.ready();

    const toggleAutoCloseBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      cfg.enableAutoClose = !cfg.enableAutoClose;
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showGlobalSettings(cfg, i);
    });
    toggleAutoCloseBtn.setLabel(config.enableAutoClose ? "Disable Auto-Close" : "Enable Auto-Close").setStyle(config.enableAutoClose ? ButtonStyle.Danger : ButtonStyle.Success);
    await toggleAutoCloseBtn.ready();

    const toggleWarningBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      cfg.enableInactivityWarning = !cfg.enableInactivityWarning;
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showGlobalSettings(cfg, i);
    });
    toggleWarningBtn.setLabel(config.enableInactivityWarning ? "Disable Warning" : "Enable Warning").setStyle(config.enableInactivityWarning ? ButtonStyle.Danger : ButtonStyle.Success);
    await toggleWarningBtn.ready();

    const row1 = new ActionRowBuilder<any>().addComponents(editLimitsBtn, toggleAutoCloseBtn, toggleWarningBtn);

    // Row 2: Toggle Typing, Toggle Attachments
    const toggleTypingBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      cfg.typingIndicators = !cfg.typingIndicators;
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showGlobalSettings(cfg, i);
    });
    toggleTypingBtn
      .setLabel(config.typingIndicators ? "Disable Typing" : "Enable Typing")
      .setEmoji(config.typingIndicators ? "🔇" : "⌨️")
      .setStyle(config.typingIndicators ? ButtonStyle.Danger : ButtonStyle.Success);
    await toggleTypingBtn.ready();

    const toggleAttachmentsBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      cfg.allowAttachments = !cfg.allowAttachments;
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showGlobalSettings(cfg, i);
    });
    toggleAttachmentsBtn
      .setLabel(config.allowAttachments ? "Disable Attachments" : "Enable Attachments")
      .setEmoji(config.allowAttachments ? "📎" : "🚫")
      .setStyle(config.allowAttachments ? ButtonStyle.Danger : ButtonStyle.Success);
    await toggleAttachmentsBtn.ready();

    const row2 = new ActionRowBuilder<any>().addComponents(toggleTypingBtn, toggleAttachmentsBtn);

    // Row 3: Staff role select
    const staffSelect = this.roleSelect(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      cfg.globalStaffRoleIds = i.roles.map((r) => r.id);
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showGlobalSettings(cfg, i);
    });
    staffSelect.setPlaceholder("Set global staff roles").setMinValues(0).setMaxValues(10);
    if (config.globalStaffRoleIds?.length) {
      staffSelect.setDefaultRoles(...config.globalStaffRoleIds);
    }
    await staffSelect.ready();

    const row3 = new ActionRowBuilder<any>().addComponents(staffSelect);

    // Row 4: Typing style select (only shown when typing is enabled)
    const rows = [row1, row2, row3];

    if (config.typingIndicators) {
      const typingStyleSelect = this.strSelect(async (i) => {
        const cfg = await this.freshConfig();
        if (!cfg) return;
        cfg.typingIndicatorStyle = i.values[0] as TypingIndicatorStyle;
        await this.saveConfig(cfg);
        await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
        await this.showGlobalSettings(cfg, i);
      });
      typingStyleSelect.setPlaceholder("Typing indicator style");
      for (const opt of TYPING_STYLE_OPTIONS) {
        typingStyleSelect.addOptions({
          label: opt.label,
          value: opt.value,
          default: config.typingIndicatorStyle === opt.value,
        });
      }
      await typingStyleSelect.ready();
      rows.push(new ActionRowBuilder<any>().addComponents(typingStyleSelect));
    }

    // Row 5: Back button
    const backBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      await this.showHome(cfg, i);
    });
    backBtn.setLabel("← Back").setStyle(ButtonStyle.Secondary);
    await backBtn.ready();

    rows.push(new ActionRowBuilder<any>().addComponents(backBtn));

    await this.flow.update({ embeds: [embed], components: rows }, interaction);
  }

  /**
   * Modal: Edit numeric limits (auto-close hours, warning hours, min message length, rate limit, max attachment MB)
   */
  private async promptEditLimits(interaction: ButtonInteraction): Promise<void> {
    const config = await this.freshConfig();
    if (!config) return;

    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Edit Global Limits");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("autoCloseHours").setLabel("Auto-close hours (1-8760)").setStyle(TextInputStyle.Short).setValue(String(config.autoCloseHours)).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("warningHours")
          .setLabel("Warning hours before close (1-168)")
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.autoCloseWarningHours))
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("minMessageLength").setLabel("Min message length (1-2000)").setStyle(TextInputStyle.Short).setValue(String(config.minimumMessageLength)).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("rateLimitSeconds").setLabel("Rate limit seconds (1-60)").setStyle(TextInputStyle.Short).setValue(String(config.rateLimitSeconds)).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("threadNamingPattern")
          .setLabel("Thread naming pattern")
          .setStyle(TextInputStyle.Short)
          .setValue(config.threadNamingPattern || "#{number} | {username} | {claimer}")
          .setRequired(true),
      ),
    );

    await interaction.showModal(modal);

    try {
      const submit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 900_000,
      });

      const cfg = await this.freshConfig();
      if (!cfg) return;

      const autoClose = parseInt(submit.fields.getTextInputValue("autoCloseHours"), 10);
      const warning = parseInt(submit.fields.getTextInputValue("warningHours"), 10);
      const minLen = parseInt(submit.fields.getTextInputValue("minMessageLength"), 10);
      const rateLimit = parseInt(submit.fields.getTextInputValue("rateLimitSeconds"), 10);
      const threadPattern = submit.fields.getTextInputValue("threadNamingPattern").trim();

      const errors: string[] = [];
      if (!isNaN(autoClose) && autoClose >= 1 && autoClose <= 8760) cfg.autoCloseHours = autoClose;
      else errors.push("Auto-close hours must be 1-8760");

      if (!isNaN(warning) && warning >= 1 && warning <= 168) cfg.autoCloseWarningHours = warning;
      else errors.push("Warning hours must be 1-168");

      if (!isNaN(minLen) && minLen >= 1 && minLen <= 2000) cfg.minimumMessageLength = minLen;
      else errors.push("Min message length must be 1-2000");

      if (!isNaN(rateLimit) && rateLimit >= 1 && rateLimit <= 60) cfg.rateLimitSeconds = rateLimit;
      else errors.push("Rate limit must be 1-60");

      if (threadPattern.length > 0 && threadPattern.length <= 100) cfg.threadNamingPattern = threadPattern;
      else errors.push("Thread naming pattern must be 1-100 chars");

      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);

      if (errors.length > 0) {
        await submit.reply({
          content: `⚠️ Some values were invalid and skipped:\n${errors.map((e) => `• ${e}`).join("\n")}`,
          flags: MessageFlags.Ephemeral,
        });
        // Still update the panel with whatever was valid
        const updatedCfg = await this.freshConfig();
        if (updatedCfg) await this.showGlobalSettings(updatedCfg, submit);
      } else {
        await this.showGlobalSettings(cfg, submit);
      }
    } catch {
      // Modal timed out — no action needed
    }
  }

  // ========================================
  // CATEGORY LIST VIEW
  // ========================================

  private async showCategoryList(config: IModmailConfig & import("mongoose").Document, interaction: PanelInteraction): Promise<void> {
    const categories = config.categories as ModmailCategory[];

    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("📂 Categories")
      .setDescription(categories.length > 0 ? "Select a category below to view or edit it." : "No categories configured. Create one to get started.")
      .setColor(0x5865f2 as ColorResolvable);

    if (categories.length > 0) {
      const list = categories
        .map((cat) => {
          const status = cat.enabled ? "✅" : "❌";
          const isDefault = cat.id === config.defaultCategoryId ? " ⭐" : "";
          const formCount = cat.formFields?.length || 0;
          return `${status} ${cat.emoji || "📁"} **${cat.name}**${isDefault} — ${formCount} field(s), <#${cat.forumChannelId}>`;
        })
        .join("\n");
      embed.addFields({ name: `Categories (${categories.length})`, value: list });
    }

    const rows: ActionRowBuilder<any>[] = [];

    // Category select (if any exist)
    if (categories.length > 0) {
      const catSelect = this.strSelect(async (i) => {
        const cfg = await this.freshConfig();
        if (!cfg) return;
        const catId = i.values[0];
        const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === catId);
        if (!cat) return;
        await this.showCategoryDetail(cfg, cat, i);
      });
      catSelect.setPlaceholder("Select a category to edit");
      for (const cat of categories) {
        catSelect.addOptions({
          label: cat.name,
          value: cat.id,
          emoji: cat.emoji || "📁",
          description: cat.description?.substring(0, 100) || "No description",
        });
      }
      await catSelect.ready();
      rows.push(new ActionRowBuilder<any>().addComponents(catSelect));
    }

    // Create + Back buttons
    const createBtn = this.btn(async (i) => {
      await this.promptCreateCategory(i);
    });
    createBtn.setLabel("Create Category").setEmoji("➕").setStyle(ButtonStyle.Success);
    await createBtn.ready();

    const backBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      await this.showHome(cfg, i);
    });
    backBtn.setLabel("← Back").setStyle(ButtonStyle.Secondary);
    await backBtn.ready();

    rows.push(new ActionRowBuilder<any>().addComponents(createBtn, backBtn));

    await this.flow.update({ embeds: [embed], components: rows }, interaction);
  }

  /**
   * Modal: Create a new category
   */
  private async promptCreateCategory(interaction: ButtonInteraction): Promise<void> {
    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Create Category");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Category Name").setStyle(TextInputStyle.Short).setMaxLength(50).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("description").setLabel("Description").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (optional)").setStyle(TextInputStyle.Short).setMaxLength(32).setRequired(false),
      ),
    );

    await interaction.showModal(modal);

    try {
      const submit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 900_000,
      });

      await submit.deferUpdate();

      const name = submit.fields.getTextInputValue("name").trim();
      const description = submit.fields.getTextInputValue("description").trim() || undefined;
      const emoji = submit.fields.getTextInputValue("emoji").trim() || undefined;

      if (!name) {
        await submit.followUp({ content: "❌ Category name is required.", flags: MessageFlags.Ephemeral });
        return;
      }

      const config = await this.freshConfig();
      if (!config) return;

      // Check duplicate name
      if ((config.categories as ModmailCategory[]).some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        await submit.followUp({ content: `❌ A category named "${name}" already exists.`, flags: MessageFlags.Ephemeral });
        const cfg = await this.freshConfig();
        if (cfg) await this.showCategoryList(cfg, submit);
        return;
      }

      // Use the forum channel from the first existing category, or show channel select
      const existingCategory = (config.categories as ModmailCategory[])[0];

      if (existingCategory) {
        // Create using existing category's forum channel
        const category = await this.pluginAPI.categoryService.createCategory(this.guildId, {
          name,
          description,
          emoji,
          forumChannelId: existingCategory.forumChannelId,
        });

        if (!category) {
          await submit.followUp({ content: "❌ Failed to create category.", flags: MessageFlags.Ephemeral });
          return;
        }

        const cfg = await this.freshConfig();
        if (cfg) {
          const newCat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
          if (newCat) {
            await this.showCategoryDetail(cfg, newCat, submit);
          } else {
            await this.showCategoryList(cfg, submit);
          }
        }
      } else {
        // No categories exist — need a forum channel selection
        // Show a follow-up with channel select
        await this.promptSelectForumChannel(submit, name, description, emoji);
      }
    } catch {
      // Modal timed out
    }
  }

  /**
   * Ephemeral follow-up: Pick a forum channel for the new category (when no existing categories)
   */
  private async promptSelectForumChannel(interaction: ModalSubmitInteraction, name: string, description: string | undefined, emoji: string | undefined): Promise<void> {
    const chSelect = this.channelSelect(async (i) => {
      await i.deferUpdate();
      const channelId = i.channels.first()?.id;
      if (!channelId) return;

      const category = await this.pluginAPI.categoryService.createCategory(this.guildId, {
        name,
        description,
        emoji,
        forumChannelId: channelId,
      });

      if (!category) {
        await i.followUp({ content: "❌ Failed to create category. Make sure you selected a forum channel.", flags: MessageFlags.Ephemeral });
        return;
      }

      const cfg = await this.freshConfig();
      if (cfg) {
        const newCat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
        if (newCat) {
          await this.showCategoryDetail(cfg, newCat, i);
        } else {
          await this.showCategoryList(cfg, i);
        }
      }
    });
    chSelect.setPlaceholder("Select a forum channel").setChannelTypes(ChannelType.GuildForum);
    await chSelect.ready();

    await interaction.followUp({
      content: `Select a forum channel for the new category **${name}**:`,
      components: [new ActionRowBuilder<any>().addComponents(chSelect)],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ========================================
  // CATEGORY DETAIL VIEW
  // ========================================

  private async showCategoryDetail(config: IModmailConfig & import("mongoose").Document, category: ModmailCategory, interaction: PanelInteraction): Promise<void> {
    const isDefault = category.id === config.defaultCategoryId;
    const staffRoles = category.staffRoleIds?.map((id) => `<@&${id}>`).join(", ") || "None (uses global)";
    const formCount = category.formFields?.length || 0;

    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle(`${category.emoji || "📁"} ${category.name}${isDefault ? " ⭐" : ""}`)
      .setDescription(category.description || "*No description*")
      .setColor(0x5865f2 as ColorResolvable)
      .addFields(
        { name: "Status", value: category.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Priority", value: PriorityLabels[category.priority] || "Normal", inline: true },
        { name: "Form Fields", value: `${formCount}/5`, inline: true },
        { name: "Forum Channel", value: `<#${category.forumChannelId}>`, inline: true },
        { name: "Staff Roles", value: staffRoles, inline: true },
        { name: "Default", value: isDefault ? "⭐ Yes" : "No", inline: true },
      );

    if (category.autoCloseHours) {
      embed.addFields({ name: "Category Auto-Close", value: `${category.autoCloseHours}h (overrides global)`, inline: true });
    }

    // Row 1: Edit Details, Toggle, Set Default, Delete
    const editBtn = this.btn(async (i) => {
      await this.promptEditCategoryDetails(category.id, i);
    });
    editBtn.setLabel("Edit Details").setEmoji("✏️").setStyle(ButtonStyle.Primary);
    await editBtn.ready();

    const toggleBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (!cat) return;
      cat.enabled = !cat.enabled;
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showCategoryDetail(cfg, cat, i);
    });
    toggleBtn.setLabel(category.enabled ? "Disable" : "Enable").setStyle(category.enabled ? ButtonStyle.Danger : ButtonStyle.Success);
    await toggleBtn.ready();

    const defaultBtn = this.btn(async (i) => {
      const success = await this.pluginAPI.categoryService.setDefaultCategory(this.guildId, category.id);
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (!cat) return;
      await this.showCategoryDetail(cfg, cat, i);
    });
    defaultBtn
      .setLabel(isDefault ? "Default ⭐" : "Set Default")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isDefault);
    await defaultBtn.ready();

    const deleteBtn = this.btn(async (i) => {
      await this.promptDeleteCategory(config, category, i);
    });
    deleteBtn.setLabel("Delete").setEmoji("🗑️").setStyle(ButtonStyle.Danger);
    await deleteBtn.ready();

    const row1 = new ActionRowBuilder<any>().addComponents(editBtn, toggleBtn, defaultBtn, deleteBtn);

    // Row 2: Form Editor, Priority select
    const formBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (!cat) return;
      await this.showFormEditor(cfg, cat, i);
    });
    formBtn.setLabel(`Form Editor (${formCount})`).setEmoji("📋").setStyle(ButtonStyle.Primary);
    await formBtn.ready();

    const backBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      await this.showCategoryList(cfg, i);
    });
    backBtn.setLabel("← Categories").setStyle(ButtonStyle.Secondary);
    await backBtn.ready();

    const row2 = new ActionRowBuilder<any>().addComponents(formBtn, backBtn);

    // Row 3: Category staff role select
    const catStaffSelect = this.roleSelect(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (!cat) return;
      cat.staffRoleIds = i.roles.map((r) => r.id);
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showCategoryDetail(cfg, cat, i);
    });
    catStaffSelect.setPlaceholder("Set category staff roles").setMinValues(0).setMaxValues(10);
    if (category.staffRoleIds?.length) {
      catStaffSelect.setDefaultRoles(...category.staffRoleIds);
    }
    await catStaffSelect.ready();

    const row3 = new ActionRowBuilder<any>().addComponents(catStaffSelect);

    // Row 4: Priority select
    const prioritySelect = this.strSelect(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (!cat) return;
      cat.priority = parseInt(i.values[0]!, 10) as 1 | 2 | 3 | 4;
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showCategoryDetail(cfg, cat, i);
    });
    prioritySelect.setPlaceholder("Set priority");
    for (const opt of PRIORITY_OPTIONS) {
      prioritySelect.addOptions({
        label: opt.label,
        value: opt.value,
        default: String(category.priority) === opt.value,
      });
    }
    await prioritySelect.ready();

    const row4 = new ActionRowBuilder<any>().addComponents(prioritySelect);

    await this.flow.update({ embeds: [embed], components: [row1, row2, row3, row4] }, interaction);
  }

  /**
   * Modal: Edit category name, description, emoji
   */
  private async promptEditCategoryDetails(categoryId: string, interaction: ButtonInteraction): Promise<void> {
    const config = await this.freshConfig();
    if (!config) return;
    const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
    if (!category) return;

    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Edit Category");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("Category Name").setStyle(TextInputStyle.Short).setValue(category.name).setMaxLength(50).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Short)
          .setValue(category.description || "")
          .setMaxLength(100)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji")
          .setLabel("Emoji (optional)")
          .setStyle(TextInputStyle.Short)
          .setValue(category.emoji || "")
          .setMaxLength(32)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("autoCloseHours")
          .setLabel("Auto-close hours override (blank = use global)")
          .setStyle(TextInputStyle.Short)
          .setValue(category.autoCloseHours ? String(category.autoCloseHours) : "")
          .setRequired(false),
      ),
    );

    await interaction.showModal(modal);

    try {
      const submit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 900_000,
      });

      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!cat) return;

      const name = submit.fields.getTextInputValue("name").trim();
      const description = submit.fields.getTextInputValue("description").trim() || undefined;
      const emoji = submit.fields.getTextInputValue("emoji").trim() || undefined;
      const autoCloseStr = submit.fields.getTextInputValue("autoCloseHours").trim();

      if (name) cat.name = name;
      cat.description = description;
      cat.emoji = emoji;

      if (autoCloseStr) {
        const hours = parseInt(autoCloseStr, 10);
        if (!isNaN(hours) && hours >= 1 && hours <= 8760) {
          cat.autoCloseHours = hours;
        }
      } else {
        cat.autoCloseHours = undefined;
      }

      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
      await this.showCategoryDetail(cfg, cat, submit);
    } catch {
      // Modal timed out
    }
  }

  /**
   * Confirmation view: Delete category
   */
  private async promptDeleteCategory(config: IModmailConfig & import("mongoose").Document, category: ModmailCategory, interaction: ButtonInteraction): Promise<void> {
    const categories = config.categories as ModmailCategory[];

    if (categories.length <= 1) {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
      await interaction.followUp({
        content: "❌ Cannot delete the last category. Create another first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("⚠️ Delete Category")
      .setDescription(`Are you sure you want to delete **${category.emoji || "📁"} ${category.name}**?\n\nThis cannot be undone. Historical modmail records will be preserved.`)
      .setColor(0xef4444 as ColorResolvable);

    const confirmBtn = this.btn(async (i) => {
      const result = await this.pluginAPI.categoryService.deleteCategory(this.guildId, category.id);
      if (!result.success) {
        await i.followUp({ content: `❌ ${result.message}`, flags: MessageFlags.Ephemeral });
      }
      const cfg = await this.freshConfig();
      if (cfg) await this.showCategoryList(cfg, i);
    });
    confirmBtn.setLabel("Delete").setEmoji("🗑️").setStyle(ButtonStyle.Danger);
    await confirmBtn.ready();

    const cancelBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (cat) {
        await this.showCategoryDetail(cfg, cat, i);
      } else {
        await this.showCategoryList(cfg, i);
      }
    });
    cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
    await cancelBtn.ready();

    const row = new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn);

    await this.flow.update({ embeds: [embed], components: [row] }, interaction);
  }

  // ========================================
  // FORM EDITOR VIEW
  // ========================================

  private async showFormEditor(config: IModmailConfig & import("mongoose").Document, category: ModmailCategory, interaction: PanelInteraction): Promise<void> {
    const fields = category.formFields || [];

    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle(`📋 Form Editor: ${category.name}`)
      .setDescription("Manage form questions for this category.\n" + "Discord modals support up to **5 text fields**.\n" + "SELECT type fields are shown as dropdowns before the modal.")
      .setColor(0x5865f2 as ColorResolvable);

    if (fields.length > 0) {
      const fieldList = fields
        .map((f, idx) => {
          const req = f.required ? "Required" : "Optional";
          const type = `${getFieldTypeEmoji(f.type)} ${getFieldTypeLabel(f.type)}`;
          const opts = f.type === ModmailFormFieldType.SELECT ? ` (${f.options?.length || 0} options)` : "";
          return `**${idx + 1}.** ${f.label}\n　${type} · ${req}${opts}`;
        })
        .join("\n");
      embed.addFields({ name: `Fields (${fields.length}/5)`, value: fieldList });
    } else {
      embed.addFields({
        name: "Fields (0/5)",
        value: "_No form fields configured._\nAdd fields to collect information before creating a thread.",
      });
    }

    const rows: ActionRowBuilder<any>[] = [];

    // Field select (if any exist)
    if (fields.length > 0) {
      const fieldSelect = this.strSelect(async (i) => {
        const cfg = await this.freshConfig();
        if (!cfg) return;
        const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
        if (!cat) return;
        const field = cat.formFields.find((f) => f.id === i.values[0]);
        if (!field) return;
        await this.showFieldEditor(cfg, cat, field, i);
      });
      fieldSelect.setPlaceholder("Select a field to edit");
      for (const field of fields) {
        fieldSelect.addOptions({
          label: field.label,
          value: field.id,
          emoji: getFieldTypeEmoji(field.type),
          description: `${getFieldTypeLabel(field.type)} · ${field.required ? "Required" : "Optional"}`,
        });
      }
      await fieldSelect.ready();
      rows.push(new ActionRowBuilder<any>().addComponents(fieldSelect));
    }

    // Add Field + Back
    const addFieldBtn = this.btn(async (i) => {
      await this.promptAddFieldType(category.id, i);
    });
    addFieldBtn
      .setLabel("Add Field")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success)
      .setDisabled(fields.length >= 5);
    await addFieldBtn.ready();

    const backBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (cat) {
        await this.showCategoryDetail(cfg, cat, i);
      } else {
        await this.showCategoryList(cfg, i);
      }
    });
    backBtn.setLabel("← Category").setStyle(ButtonStyle.Secondary);
    await backBtn.ready();

    rows.push(new ActionRowBuilder<any>().addComponents(addFieldBtn, backBtn));

    await this.flow.update({ embeds: [embed], components: rows }, interaction);
  }

  /**
   * Step 1 of adding a field: select the field type via string select
   */
  private async promptAddFieldType(categoryId: string, interaction: ButtonInteraction): Promise<void> {
    // Show type selection as an update to the panel
    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("➕ Add Form Field")
      .setDescription("Select the type of field to add:")
      .setColor(0x22c55e as ColorResolvable);

    const typeSelect = this.strSelect(async (i) => {
      const fieldType = i.values[0] as ModmailFormFieldType;
      await this.promptAddFieldDetails(categoryId, fieldType, i);
    });
    typeSelect.setPlaceholder("Select field type");
    for (const opt of FIELD_TYPE_OPTIONS) {
      typeSelect.addOptions({
        label: opt.label,
        value: opt.value,
        description: opt.description,
      });
    }
    await typeSelect.ready();

    const cancelBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (cat) await this.showFormEditor(cfg, cat, i);
    });
    cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
    await cancelBtn.ready();

    await this.flow.update(
      {
        embeds: [embed],
        components: [new ActionRowBuilder<any>().addComponents(typeSelect), new ActionRowBuilder<any>().addComponents(cancelBtn)],
      },
      interaction,
    );
  }

  /**
   * Step 2 of adding a field: modal for label/placeholder/required
   */
  private async promptAddFieldDetails(categoryId: string, fieldType: ModmailFormFieldType, interaction: StringSelectMenuInteraction): Promise<void> {
    // Must deferUpdate before showing modal since select already acknowledged
    // Actually, we need to show a modal. But the select interaction was already
    // acknowledged by the strSelect wrapper's callback. So we need to show the
    // modal via a button instead. Let's update the panel with a "Continue" button.

    // We can't showModal from an already-deferred interaction.
    // Instead, show a button that will open the modal.
    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle(`➕ Add ${getFieldTypeLabel(fieldType)} Field`)
      .setDescription("Click **Continue** to enter field details.")
      .setColor(0x22c55e as ColorResolvable);

    const continueBtn = this.btn(async (i) => {
      // Now we can show a modal from this fresh button interaction
      const modalId = nanoid();
      const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Add ${getFieldTypeLabel(fieldType)} Field`);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("label").setLabel("Field Label").setStyle(TextInputStyle.Short).setMaxLength(45).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("placeholder").setLabel("Placeholder text (optional)").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("required").setLabel("Required? (yes/no)").setStyle(TextInputStyle.Short).setValue("yes").setRequired(true),
        ),
      );

      await i.showModal(modal);

      try {
        const submit = await i.awaitModalSubmit({
          filter: (mi) => mi.user.id === i.user.id && mi.customId === modalId,
          time: 900_000,
        });

        const label = submit.fields.getTextInputValue("label").trim();
        const placeholder = submit.fields.getTextInputValue("placeholder").trim() || undefined;
        const requiredStr = submit.fields.getTextInputValue("required").trim().toLowerCase();
        const required = requiredStr !== "no" && requiredStr !== "false" && requiredStr !== "n";

        if (!label) {
          await submit.reply({ content: "❌ Field label is required.", ephemeral: true });
          return;
        }

        const field = await this.pluginAPI.categoryService.addFormField(this.guildId, categoryId, {
          label,
          type: fieldType,
          required,
          placeholder,
          options: fieldType === ModmailFormFieldType.SELECT ? [] : undefined,
        });

        if (!field) {
          await submit.reply({ content: "❌ Failed to add field. Max 5 fields per category.", ephemeral: true });
          return;
        }

        const cfg = await this.freshConfig();
        if (cfg) {
          const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === categoryId);
          if (cat) {
            // If it's a SELECT field, go to option editor
            if (fieldType === ModmailFormFieldType.SELECT) {
              const newField = cat.formFields.find((f) => f.id === field.id);
              if (newField) {
                await this.showOptionEditor(cfg, cat, newField, submit);
                return;
              }
            }
            await this.showFormEditor(cfg, cat, submit);
          }
        }
      } catch {
        // Modal timed out
      }
    });
    continueBtn.setLabel("Continue").setEmoji("📝").setStyle(ButtonStyle.Success);
    await continueBtn.ready();

    const cancelBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (cat) await this.showFormEditor(cfg, cat, i);
    });
    cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
    await cancelBtn.ready();

    await this.flow.update(
      {
        embeds: [embed],
        components: [new ActionRowBuilder<any>().addComponents(continueBtn, cancelBtn)],
      },
      interaction,
    );
  }

  // ========================================
  // FIELD EDITOR VIEW
  // ========================================

  private async showFieldEditor(config: IModmailConfig & import("mongoose").Document, category: ModmailCategory, field: FormField, interaction: PanelInteraction): Promise<void> {
    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle(`${getFieldTypeEmoji(field.type)} Field: ${field.label}`)
      .setColor(0x5865f2 as ColorResolvable)
      .addFields(
        { name: "Type", value: getFieldTypeLabel(field.type), inline: true },
        { name: "Required", value: field.required ? "✅ Yes" : "❌ No", inline: true },
        { name: "Placeholder", value: field.placeholder || "_None_", inline: true },
      );

    if (field.type === ModmailFormFieldType.SELECT) {
      const optionList = field.options?.length ? field.options.map((o, idx) => `${idx + 1}. **${o.label}** → \`${o.value}\``).join("\n") : "_No options configured_";
      embed.addFields({ name: `Options (${field.options?.length || 0})`, value: optionList });
    }

    // Row 1: Edit, Delete, Manage Options (if SELECT)
    const editBtn = this.btn(async (i) => {
      await this.promptEditFieldDetails(category.id, field.id, i);
    });
    editBtn.setLabel("Edit Details").setEmoji("✏️").setStyle(ButtonStyle.Primary);
    await editBtn.ready();

    const deleteBtn = this.btn(async (i) => {
      await this.promptDeleteField(config, category, field, i);
    });
    deleteBtn.setLabel("Delete Field").setEmoji("🗑️").setStyle(ButtonStyle.Danger);
    await deleteBtn.ready();

    const row1Components: any[] = [editBtn, deleteBtn];

    if (field.type === ModmailFormFieldType.SELECT) {
      const optionsBtn = this.btn(async (i) => {
        const cfg = await this.freshConfig();
        if (!cfg) return;
        const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
        if (!cat) return;
        const f = cat.formFields.find((ff) => ff.id === field.id);
        if (!f) return;
        await this.showOptionEditor(cfg, cat, f, i);
      });
      optionsBtn
        .setLabel(`Options (${field.options?.length || 0})`)
        .setEmoji("🔽")
        .setStyle(ButtonStyle.Primary);
      await optionsBtn.ready();
      row1Components.push(optionsBtn);
    }

    const backBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (cat) await this.showFormEditor(cfg, cat, i);
    });
    backBtn.setLabel("← Fields").setStyle(ButtonStyle.Secondary);
    await backBtn.ready();
    row1Components.push(backBtn);

    const row1 = new ActionRowBuilder<any>().addComponents(...row1Components);

    await this.flow.update({ embeds: [embed], components: [row1] }, interaction);
  }

  /**
   * Modal: Edit field label, placeholder, required
   */
  private async promptEditFieldDetails(categoryId: string, fieldId: string, interaction: ButtonInteraction): Promise<void> {
    const config = await this.freshConfig();
    if (!config) return;
    const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
    if (!category) return;
    const field = category.formFields.find((f) => f.id === fieldId);
    if (!field) return;

    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Edit Field");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("label").setLabel("Field Label").setStyle(TextInputStyle.Short).setValue(field.label).setMaxLength(45).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("placeholder")
          .setLabel("Placeholder text")
          .setStyle(TextInputStyle.Short)
          .setValue(field.placeholder || "")
          .setMaxLength(100)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("required")
          .setLabel("Required? (yes/no)")
          .setStyle(TextInputStyle.Short)
          .setValue(field.required ? "yes" : "no")
          .setRequired(true),
      ),
    );

    await interaction.showModal(modal);

    try {
      const submit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 900_000,
      });

      const label = submit.fields.getTextInputValue("label").trim();
      const placeholder = submit.fields.getTextInputValue("placeholder").trim() || undefined;
      const requiredStr = submit.fields.getTextInputValue("required").trim().toLowerCase();
      const required = requiredStr !== "no" && requiredStr !== "false" && requiredStr !== "n";

      if (!label) {
        await submit.reply({ content: "❌ Field label is required.", ephemeral: true });
        return;
      }

      await this.pluginAPI.categoryService.updateFormField(this.guildId, categoryId, fieldId, {
        label,
        placeholder,
        required,
      });

      const cfg = await this.freshConfig();
      if (cfg) {
        const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === categoryId);
        if (cat) {
          const f = cat.formFields.find((ff) => ff.id === fieldId);
          if (f) {
            await this.showFieldEditor(cfg, cat, f, submit);
            return;
          }
          await this.showFormEditor(cfg, cat, submit);
        }
      }
    } catch {
      // Modal timed out
    }
  }

  /**
   * Confirmation: Delete field
   */
  private async promptDeleteField(config: IModmailConfig & import("mongoose").Document, category: ModmailCategory, field: FormField, interaction: ButtonInteraction): Promise<void> {
    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("⚠️ Delete Field")
      .setDescription(`Delete the field **${field.label}** from **${category.name}**?\n\nThis cannot be undone.`)
      .setColor(0xef4444 as ColorResolvable);

    const confirmBtn = this.btn(async (i) => {
      await this.pluginAPI.categoryService.removeFormField(this.guildId, category.id, field.id);
      const cfg = await this.freshConfig();
      if (cfg) {
        const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
        if (cat) await this.showFormEditor(cfg, cat, i);
      }
    });
    confirmBtn.setLabel("Delete").setEmoji("🗑️").setStyle(ButtonStyle.Danger);
    await confirmBtn.ready();

    const cancelBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (!cat) return;
      const f = cat.formFields.find((ff) => ff.id === field.id);
      if (f) {
        await this.showFieldEditor(cfg, cat, f, i);
      } else {
        await this.showFormEditor(cfg, cat, i);
      }
    });
    cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
    await cancelBtn.ready();

    await this.flow.update({ embeds: [embed], components: [new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn)] }, interaction);
  }

  // ========================================
  // OPTION EDITOR VIEW (for SELECT fields)
  // ========================================

  private async showOptionEditor(config: IModmailConfig & import("mongoose").Document, category: ModmailCategory, field: FormField, interaction: PanelInteraction): Promise<void> {
    const options = field.options || [];

    const embed = this.pluginAPI.lib
      .createEmbedBuilder()
      .setTitle(`🔽 Options: ${field.label}`)
      .setDescription("Manage the dropdown options for this select field.")
      .setColor(0x5865f2 as ColorResolvable);

    if (options.length > 0) {
      const optList = options.map((o, idx) => `**${idx + 1}.** ${o.label} → \`${o.value}\``).join("\n");
      embed.addFields({ name: `Options (${options.length}/25)`, value: optList.substring(0, 1024) });
    } else {
      embed.addFields({ name: "Options (0/25)", value: "_No options yet. Add at least one._" });
    }

    const rows: ActionRowBuilder<any>[] = [];

    // Remove option select (if any exist)
    if (options.length > 0) {
      const removeSelect = this.strSelect(async (i) => {
        const optValue = i.values[0]!;
        const cfg = await this.freshConfig();
        if (!cfg) return;
        const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
        if (!cat) return;
        const f = cat.formFields.find((ff) => ff.id === field.id);
        if (!f || !f.options) return;

        f.options = f.options.filter((o) => o.value !== optValue);
        await this.saveConfig(cfg);
        await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);
        await this.showOptionEditor(cfg, cat, f, i);
      });
      removeSelect.setPlaceholder("Select an option to remove");
      for (const opt of options) {
        removeSelect.addOptions({
          label: `🗑️ ${opt.label}`,
          value: opt.value,
          description: `Value: ${opt.value}`,
        });
      }
      await removeSelect.ready();
      rows.push(new ActionRowBuilder<any>().addComponents(removeSelect));
    }

    // Add option + Back buttons
    const addBtn = this.btn(async (i) => {
      await this.promptAddOption(category.id, field.id, i);
    });
    addBtn
      .setLabel("Add Option")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success)
      .setDisabled(options.length >= 25);
    await addBtn.ready();

    const backBtn = this.btn(async (i) => {
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === category.id);
      if (!cat) return;
      const f = cat.formFields.find((ff) => ff.id === field.id);
      if (f) {
        await this.showFieldEditor(cfg, cat, f, i);
      } else {
        await this.showFormEditor(cfg, cat, i);
      }
    });
    backBtn.setLabel("← Field").setStyle(ButtonStyle.Secondary);
    await backBtn.ready();

    rows.push(new ActionRowBuilder<any>().addComponents(addBtn, backBtn));

    await this.flow.update({ embeds: [embed], components: rows }, interaction);
  }

  /**
   * Modal: Add a select option (label + value)
   */
  private async promptAddOption(categoryId: string, fieldId: string, interaction: ButtonInteraction): Promise<void> {
    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Add Option");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("label").setLabel("Option Label (shown to user)").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("value").setLabel("Option Value (stored internally)").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true),
      ),
    );

    await interaction.showModal(modal);

    try {
      const submit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 900_000,
      });

      const label = submit.fields.getTextInputValue("label").trim();
      const value = submit.fields.getTextInputValue("value").trim();

      if (!label || !value) {
        await submit.reply({ content: "❌ Both label and value are required.", ephemeral: true });
        return;
      }

      // Fetch fresh config and add option
      const cfg = await this.freshConfig();
      if (!cfg) return;
      const cat = (cfg.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!cat) return;
      const field = cat.formFields.find((f) => f.id === fieldId);
      if (!field) return;

      if (!field.options) field.options = [];

      // Check for duplicate value
      if (field.options.some((o) => o.value === value)) {
        await submit.reply({ content: `❌ An option with value "${value}" already exists.`, ephemeral: true });
        return;
      }

      field.options.push({ label, value });
      await this.saveConfig(cfg);
      await this.pluginAPI.modmailService.invalidateConfigCache(this.guildId);

      await this.showOptionEditor(cfg, cat, field, submit);
    } catch {
      // Modal timed out
    }
  }
}
