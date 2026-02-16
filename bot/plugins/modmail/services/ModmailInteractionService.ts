/**
 * ModmailInteractionService - Handles button/component interactions for modmail
 *
 * Uses ComponentCallbackService to register persistent handlers for:
 * - User actions: create, category select, question select
 * - Staff actions: claim, resolve, close, ban
 *
 * All handlers use context-based thread detection (no metadata parsing needed)
 */

import type { Client, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction, GuildMember, Message } from "discord.js";
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ModmailService } from "./ModmailService.js";
import type { ModmailSessionService, CreateSessionData } from "./ModmailSessionService.js";
import type { ModmailCreationService } from "./ModmailCreationService.js";
import type { ModmailCategoryService } from "./ModmailCategoryService.js";
import type { ModmailCategory } from "../models/ModmailConfig.js";
import type { IModmail } from "../models/Modmail.js";
import { ModmailStatus } from "../models/Modmail.js";
import type { LibAPI } from "../../lib/index.js";
import { ModmailEmbeds } from "../utils/ModmailEmbeds.js";
import { formatStaffReply } from "../utils/formatStaffReply.js";
import { createCloseTicketRow, createResolveButtonRow } from "../utils/modmailButtons.js";
import type { ComponentCallbackService } from "../../../src/core/services/ComponentCallbackService.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { SupportCoreAPI } from "../../support-core/index.js";
import { SupportBanSystem, SupportBanType } from "../../support-core/index.js";
import { nanoid } from "nanoid";

/**
 * ModmailInteractionService - Component interaction handlers for modmail
 */
export class ModmailInteractionService {
  constructor(
    private client: Client,
    private modmailService: ModmailService,
    private sessionService: ModmailSessionService,
    private creationService: ModmailCreationService,
    private categoryService: ModmailCategoryService,
    private lib: LibAPI,
    private componentCallbackService: ComponentCallbackService,
    private logger: PluginLogger,
    private supportCoreApi?: SupportCoreAPI,
  ) {}

  /**
   * Initialize and register all persistent handlers
   * Should be called during plugin load
   */
  async initialize(): Promise<void> {
    this.registerPersistentHandlers();
    this.logger.info("✅ ModmailInteractionService initialized");
  }

  /**
   * Send post-creation DM confirmation to user and update the ephemeral reply.
   * Handles DMs-disabled case with a warning embed.
   */
  private async sendCreationConfirmation(params: {
    user: { id: string; createDM: () => Promise<any> };
    guildName: string;
    categoryName: string;
    ticketNumber?: number;
    initialMessage?: string;
    replyTarget: { editReply: (opts: any) => Promise<any> };
  }): Promise<void> {
    let dmSent = false;
    try {
      const dmChannel = await params.user.createDM();
      const closeRow = await createCloseTicketRow(this.lib);

      await dmChannel.send({
        embeds: [ModmailEmbeds.threadCreated(params.guildName, params.categoryName, params.initialMessage)],
        components: [closeRow],
      });
      dmSent = true;
    } catch {
      this.logger.debug(`Could not send DM confirmation to user ${params.user.id}`);
    }

    if (dmSent) {
      await params.replyTarget.editReply({
        embeds: [ModmailEmbeds.success("Ticket Created", `Your support ticket **#${params.ticketNumber}** has been created!\n\n**Check your DMs** — staff will respond there.`)],
      });
    } else {
      await params.replyTarget.editReply({
        embeds: [
          ModmailEmbeds.warning(
            "Ticket Created — DMs Disabled",
            `Your support ticket **#${params.ticketNumber}** has been created, but we couldn't send you a DM.\n\nPlease enable DMs from server members to receive staff responses.\n\n**Privacy Settings** → **Allow direct messages from server members**`,
          ),
        ],
      });
    }
  }

  /**
   * Central close method — all close paths funnel through here.
   *
   * Handles:
   * 1. Optional final message relay (as normal staff message format)
   * 2. Optional final message webhook log in thread
   * 3. Database close via ModmailService.closeModmail()
   * 4. Close embed DM to user (mirrored)
   * 5. Close embed posted in staff thread (mirrored)
   * 6. Disable starter buttons
   * 7. Lock and archive thread
   *
   * @returns `{ success: boolean; dmFailed?: boolean }` — dmFailed is true if user DM could not be sent
   */
  async executeClose(params: {
    modmail: IModmail;
    closedBy: string;
    closedByDisplayName: string;
    reason?: string;
    finalMessage?: string;
    isStaff: boolean;
    /** Staff member's avatar URL for webhook logging */
    staffAvatarURL?: string;
  }): Promise<{ success: boolean; dmFailed?: boolean }> {
    const { modmail, closedBy, closedByDisplayName, reason, finalMessage, isStaff, staffAvatarURL } = params;

    const user = await this.lib.thingGetter.getUser(modmail.userId as string);
    let dmFailed = false;

    // 1. Send optional final message as a normal staff relay before closing
    if (finalMessage && user) {
      let guildName = "the server";
      try {
        const guild = await this.lib.thingGetter.getGuild(modmail.guildId as string);
        if (guild) guildName = guild.name;
      } catch {
        /* use default */
      }

      try {
        await user.send({
          content: formatStaffReply(finalMessage, closedByDisplayName, guildName),
        });
      } catch {
        dmFailed = true;
      }

      // Log final message in thread via webhook
      const config = await this.modmailService.getConfig(modmail.guildId as string);
      if (config && modmail.categoryId) {
        try {
          const webhook = await this.modmailService.getWebhook(config, modmail.categoryId as string);
          if (webhook) {
            await webhook.send({
              content: `**[Final Message]** ${finalMessage}`,
              threadId: modmail.forumThreadId as string,
              username: closedByDisplayName,
              avatarURL: staffAvatarURL,
            });
          }
        } catch (webhookError) {
          this.logger.warn("Failed to send final message via webhook:", webhookError);
        }
      }
    }

    // 2. Close in database
    const effectiveReason = reason || (finalMessage ? "Closed with final message" : undefined);
    const success = await this.modmailService.closeModmail({
      modmailId: modmail.modmailId as string,
      closedBy,
      reason: effectiveReason,
      isStaff,
    });

    if (!success) return { success: false };

    // 3. Send close embed to user DM (mirrored)
    if (user) {
      try {
        await user.send({
          embeds: [ModmailEmbeds.threadClosed(closedByDisplayName, effectiveReason)],
        });
      } catch {
        dmFailed = true;
      }
    }

    // 4. Post mirrored close embed in staff thread
    try {
      const thread = await this.lib.thingGetter.getChannel(modmail.forumThreadId as string);
      if (thread?.isThread()) {
        await thread.send({
          embeds: [ModmailEmbeds.threadClosed(closedByDisplayName, effectiveReason || "No reason provided")],
        });
      }
    } catch {
      this.logger.debug(`Failed to send close embed in thread ${modmail.forumThreadId}`);
    }

    // 5. Disable starter buttons, lock, and archive
    await this.modmailService.finalizeThread(modmail.forumThreadId as string);

    this.logger.info(`Modmail ${modmail.modmailId} closed by ${closedBy} (staff: ${isStaff})`);

    return { success: true, dmFailed };
  }

  /**
   * Register all persistent component handlers
   */
  private registerPersistentHandlers(): void {
    // ========================================
    // USER-FACING HANDLERS
    // ========================================

    // "Contact Support" button - show reason modal or category select
    this.componentCallbackService.registerPersistentHandler("modmail.create", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleCreateButton(interaction);
    });

    // Category selection from dropdown
    this.componentCallbackService.registerPersistentHandler("modmail.create.category", async (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      await this.handleCategorySelect(interaction);
    });

    // modmail.question.select is registered by ModmailQuestionHandler constructor

    // "I Need More Help" button - cancels resolve timer, sends SOS embed
    this.componentCallbackService.registerPersistentHandler("modmail.user.reopen", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleNeedMoreHelp(interaction);
    });

    // "Close Ticket" button - user closes their own modmail from DM
    this.componentCallbackService.registerPersistentHandler("modmail.user.close", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleUserClose(interaction);
    });

    // ========================================
    // STAFF HANDLERS (context-based, work from any thread)
    // ========================================

    // Staff claim button
    this.componentCallbackService.registerPersistentHandler(
      "modmail.staff.claim",
      async (interaction) => {
        if (!interaction.isButton()) return;
        await this.handleStaffClaim(interaction);
      },
      {
        actionKey: "interactions.modmail.manage",
        label: "Manage Modmail",
        description: "Claim and manage modmail threads.",
      },
    );

    // Staff resolve button
    this.componentCallbackService.registerPersistentHandler(
      "modmail.staff.resolve",
      async (interaction) => {
        if (!interaction.isButton()) return;
        await this.handleStaffResolve(interaction);
      },
      {
        actionKey: "interactions.modmail.manage",
        label: "Manage Modmail",
        description: "Resolve modmail threads.",
      },
    );

    // Staff close button
    this.componentCallbackService.registerPersistentHandler(
      "modmail.staff.close",
      async (interaction) => {
        if (!interaction.isButton()) return;
        await this.handleStaffClose(interaction);
      },
      {
        actionKey: "interactions.modmail.manage",
        label: "Manage Modmail",
        description: "Close modmail threads.",
      },
    );

    // Staff close WITH final message button
    this.componentCallbackService.registerPersistentHandler(
      "modmail.staff.close_with_message",
      async (interaction) => {
        if (!interaction.isButton()) return;
        await this.handleStaffCloseWithMessage(interaction);
      },
      {
        actionKey: "interactions.modmail.manage",
        label: "Manage Modmail",
        description: "Close modmail threads with a final message.",
      },
    );

    // Staff ban button
    this.componentCallbackService.registerPersistentHandler(
      "modmail.staff.ban",
      async (interaction) => {
        if (!interaction.isButton()) return;
        await this.handleStaffBan(interaction);
      },
      {
        actionKey: "interactions.modmail.manage",
        label: "Manage Modmail",
        description: "Ban users from modmail.",
      },
    );

    this.logger.debug("Registered all modmail persistent handlers");
  }

  // ========================================
  // USER HANDLER IMPLEMENTATIONS
  // ========================================

  /**
   * Handle "Contact Support" button click
   * Shows category select if multiple, or reason modal if single category
   */
  private async handleCreateButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ This button can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Get config
    const config = await this.modmailService.getConfig(guildId);
    if (!config) {
      await interaction.reply({
        content: "❌ Modmail is not configured in this server.",
        ephemeral: true,
      });
      return;
    }

    // Check if banned
    const isBanned = await this.modmailService.isUserBanned(guildId, userId);
    if (isBanned) {
      await interaction.reply({
        content: "❌ You are banned from using modmail in this server.",
        ephemeral: true,
      });
      return;
    }

    // Check existing open modmail
    const hasOpen = await this.modmailService.userHasOpenModmail(guildId, userId);
    if (hasOpen) {
      await interaction.reply({
        content: "❌ You already have an open modmail conversation. Please wait for a response or close your existing ticket.",
        ephemeral: true,
      });
      return;
    }

    // Get enabled categories
    const categories = (config.categories as ModmailCategory[]).filter((c) => c.enabled);

    if (categories.length === 0) {
      await interaction.reply({
        content: "❌ No modmail categories are available.",
        ephemeral: true,
      });
      return;
    }

    if (categories.length === 1) {
      // Single category
      const firstCategory = categories[0];
      if (firstCategory) {
        if (firstCategory.formFields && firstCategory.formFields.length > 0) {
          // Category has form fields — show form modal
          await this.showFormModal(interaction, firstCategory, guildId);
        } else {
          // No form fields — show reason modal directly
          await this.showReasonModal(interaction, firstCategory.id, guildId);
        }
      }
    } else {
      // Multiple categories - show category select
      await this.showCategorySelect(interaction, categories);
    }
  }

  /**
   * Show category selection dropdown
   */
  private async showCategorySelect(interaction: ButtonInteraction, categories: ModmailCategory[]): Promise<void> {
    // Use createPersistentComponent to properly track the component in the database
    const customId = await this.componentCallbackService.createPersistentComponent("modmail.create.category", "selectMenu");

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Select a category")
      .addOptions(
        categories.map((cat) => ({
          label: cat.name,
          description: cat.description?.substring(0, 100) || undefined,
          value: cat.id,
          emoji: cat.emoji || undefined,
        })),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const embed = this.lib.createEmbedBuilder().setTitle("📬 Contact Support").setDescription("Please select a category for your support request:").setColor(0x5865f2);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  }

  /**
   * Show the reason/initial message modal
   */
  private async showReasonModal(interaction: ButtonInteraction | StringSelectMenuInteraction, categoryId: string, guildId: string): Promise<void> {
    const modalId = nanoid(12);

    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Contact Support");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("How can we help you?")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Describe your issue or question...")
      .setMinLength(10)
      .setMaxLength(2000)
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
      const submission = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
        time: 900_000, // 15 minutes
      });

      await submission.deferReply({ ephemeral: true });

      const reason = submission.fields.getTextInputValue("reason");

      // Get user display name
      const member = interaction.member as GuildMember | null;
      const userDisplayName = member?.displayName || interaction.user.displayName || interaction.user.username;

      // Create the modmail
      const result = await this.creationService.createModmail({
        guildId,
        userId: interaction.user.id,
        userDisplayName,
        initialMessage: reason,
        categoryId,
        createdVia: "button",
      });

      if (result.success) {
        // Fetch category name for DM
        const config = await this.modmailService.getConfig(guildId);
        const category = (config?.categories as ModmailCategory[])?.find((c) => c.id === categoryId);
        const categoryName = category?.name || "General Support";

        await this.sendCreationConfirmation({
          user: interaction.user,
          guildName: interaction.guild!.name,
          categoryName,
          ticketNumber: result.metadata?.ticketNumber,
          initialMessage: reason,
          replyTarget: submission,
        });
      } else {
        await submission.editReply({
          embeds: [ModmailEmbeds.error("Creation Failed", result.userMessage || "Failed to create modmail. Please try again later.")],
        });
      }
    } catch (error) {
      // Modal timed out or was dismissed
      this.logger.debug(`Reason modal timed out or was dismissed for user ${interaction.user.id}`);
    }
  }

  /**
   * Handle category selection
   */
  private async handleCategorySelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const categoryId = interaction.values[0];
    const guildId = interaction.guild?.id;

    if (!guildId) {
      await interaction.reply({
        content: "❌ Could not determine server.",
        ephemeral: true,
      });
      return;
    }

    // Get category to check if it has form fields
    const config = await this.modmailService.getConfig(guildId);
    const category = (config?.categories as ModmailCategory[])?.find((c) => c.id === categoryId);

    if (!category) {
      await interaction.reply({
        content: "❌ Category not found.",
        ephemeral: true,
      });
      return;
    }

    // If category has form fields, we need to collect them first
    if (category.formFields && category.formFields.length > 0) {
      // Create a session and show form modal
      await this.showFormModal(interaction, category, guildId);
    } else {
      // No form fields - show reason modal directly (use category.id which we verified exists)
      await this.showReasonModal(interaction, category.id, guildId);
    }
  }

  /**
   * Show form modal for categories with custom form fields
   */
  private async showFormModal(interaction: StringSelectMenuInteraction | ButtonInteraction, category: ModmailCategory, guildId: string): Promise<void> {
    const modalId = nanoid(12);
    const formFields = category.formFields || [];

    // Discord modals can have max 5 text inputs
    const fieldsToShow = formFields.slice(0, 5);

    const modal = new ModalBuilder().setCustomId(modalId).setTitle(`${category.name} Request`);

    for (const field of fieldsToShow) {
      const input = new TextInputBuilder()
        .setCustomId(field.id)
        .setLabel(field.label)
        .setStyle(field.type === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(field.required);

      if (field.placeholder) {
        input.setPlaceholder(field.placeholder);
      }
      if (field.minLength) {
        input.setMinLength(field.minLength);
      }
      if (field.maxLength) {
        input.setMaxLength(field.maxLength);
      }

      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
      modal.addComponents(row);
    }

    await interaction.showModal(modal);

    try {
      const submission = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
        time: 900_000, // 15 minutes
      });

      await submission.deferReply({ ephemeral: true });

      // Collect form responses
      const formResponses = fieldsToShow.map((field) => ({
        fieldId: field.id,
        fieldLabel: field.label,
        fieldType: field.type as "short" | "paragraph" | "select" | "number",
        value: submission.fields.getTextInputValue(field.id),
      }));

      // Get initial message from first field or a summary
      const initialMessage = formResponses.map((r) => `**${r.fieldLabel}**: ${r.value}`).join("\n");

      // Get user display name
      const member = interaction.member as GuildMember | null;
      const userDisplayName = member?.displayName || interaction.user.displayName || interaction.user.username;

      // Create the modmail with form responses
      const result = await this.creationService.createModmail({
        guildId,
        userId: interaction.user.id,
        userDisplayName,
        initialMessage,
        categoryId: category.id,
        formResponses,
        createdVia: "button",
      });

      if (result.success) {
        await this.sendCreationConfirmation({
          user: interaction.user,
          guildName: interaction.guild!.name,
          categoryName: category.name,
          ticketNumber: result.metadata?.ticketNumber,
          initialMessage,
          replyTarget: submission,
        });
      } else {
        await submission.editReply({
          embeds: [ModmailEmbeds.error("Creation Failed", result.userMessage || "Failed to create modmail. Please try again later.")],
        });
      }
    } catch (error) {
      // Modal timed out or was dismissed
      this.logger.debug(`Form modal timed out or was dismissed for user ${interaction.user.id}`);
    }
  }

  /**
   * Handle multi-select question answer
   */
  private async handleQuestionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    // Get session ID from user
    const sessionId = await this.sessionService.getUserActiveSession(interaction.user.id);
    if (!sessionId) {
      await interaction.reply({
        content: "❌ Your session has expired. Please start over.",
        ephemeral: true,
      });
      return;
    }

    // Get the actual session
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      await interaction.reply({
        content: "❌ Your session has expired. Please start over.",
        ephemeral: true,
      });
      return;
    }

    // Store the answer(s)
    const selectedValues = interaction.values.join(", ");
    const currentStep = session.currentStep;

    // Record the answer
    await this.sessionService.recordAnswer(sessionId, `step_${currentStep}`, selectedValues);

    // Advance to next step
    await this.sessionService.updateSession(sessionId, {
      currentStep: currentStep + 1,
    });

    await interaction.reply({
      content: "✅ Answer recorded.",
      ephemeral: true,
    });
  }

  // ========================================
  // STAFF HANDLER IMPLEMENTATIONS
  // ========================================

  /**
   * Fetch modmail by thread and guard against closed/invalid state.
   * Returns the modmail if valid, or null if handled (replied to interaction).
   */
  private async getModmailOrGuard(interaction: ButtonInteraction): Promise<IModmail | null> {
    const modmail = await this.modmailService.getModmailByThreadId(interaction.channelId);
    if (!modmail) {
      await interaction.reply({
        embeds: [ModmailEmbeds.invalidContext("in a modmail thread")],
        ephemeral: true,
      });
      return null;
    }

    if (modmail.status === ModmailStatus.CLOSED) {
      await interaction.reply({
        embeds: [ModmailEmbeds.warning("Ticket Closed", "This ticket is already closed. No further actions can be taken.")],
        ephemeral: true,
      });
      return null;
    }

    return modmail;
  }

  /**
   * Handle staff claim button (atomic operation to prevent race conditions)
   */
  private async handleStaffClaim(interaction: ButtonInteraction): Promise<void> {
    const modmail = await this.getModmailOrGuard(interaction);
    if (!modmail) return;

    const result = await this.modmailService.claimModmail(modmail.modmailId as string, interaction.user.id);

    if (result.success) {
      // Update thread name with claimer
      await this.modmailService.updateThreadNameOnClaim(modmail.modmailId as string, interaction.user.id);

      // Get staff display name
      const staffDisplayName = interaction.user.displayName || interaction.user.username;

      // Notify user via DM
      const user = await this.lib.thingGetter.getUser(modmail.userId as string);
      if (user) {
        try {
          await user.send({
            embeds: [ModmailEmbeds.threadClaimed(staffDisplayName)],
          });
        } catch {
          // User may have DMs disabled
        }
      }

      // Update starter message status to Claimed
      await this.modmailService.updateStarterMessageStatus(modmail.forumThreadId as string, ModmailStatus.OPEN, {
        claimedBy: staffDisplayName,
      });

      // Send thread-side notification (mirrored embed, visible to all staff)
      await interaction.reply({
        embeds: [ModmailEmbeds.threadClaimedStaff(staffDisplayName)],
        ephemeral: false,
      });
    } else if (result.alreadyClaimedBy) {
      // Show who claimed it
      await interaction.reply({
        embeds: [ModmailEmbeds.info("Already Claimed", `This ticket was already claimed by <@${result.alreadyClaimedBy}>.`)],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("Claim Failed", "Failed to claim this ticket. Please try again.")],
        ephemeral: true,
      });
    }
  }

  /**
   * Handle staff resolve button
   */
  private async handleStaffResolve(interaction: ButtonInteraction): Promise<void> {
    const modmail = await this.getModmailOrGuard(interaction);
    if (!modmail) return;

    // Check if already resolved
    if (modmail.status === ModmailStatus.RESOLVED) {
      await interaction.reply({
        embeds: [ModmailEmbeds.info("Already Resolved", "This ticket is already marked as resolved. It will auto-close if the user doesn't respond.")],
        ephemeral: true,
      });
      return;
    }

    const success = await this.modmailService.markResolved(modmail.modmailId as string, interaction.user.id);

    if (success) {
      // Get config for auto-close hours
      const config = await this.modmailService.getConfig(modmail.guildId as string);

      // Get staff display name
      const staffDisplayName = interaction.user.displayName || interaction.user.username;

      // Get auto-close hours (category-specific or default)
      const category = (config?.categories as any[])?.find((c) => c.id === modmail.categoryId);
      const autoCloseHours = category?.resolveAutoCloseHours || 24;

      const resolveRow = await createResolveButtonRow(this.lib, modmail.modmailId as string);

      // Notify user via DM with rich embed and resolve buttons
      const user = await this.lib.thingGetter.getUser(modmail.userId as string);
      if (user) {
        try {
          await user.send({
            embeds: [ModmailEmbeds.threadResolved(staffDisplayName, autoCloseHours)],
            components: [resolveRow],
          });
        } catch {
          // User may have DMs disabled
        }
      }

      // Update starter message status to Resolved
      await this.modmailService.updateStarterMessageStatus(modmail.forumThreadId as string, ModmailStatus.RESOLVED);

      // Send thread-side notification (mirrored embed, visible to all staff)
      await interaction.reply({
        embeds: [ModmailEmbeds.threadResolvedStaff(staffDisplayName, autoCloseHours)],
        ephemeral: false,
      });
    } else {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("Failed", "Failed to mark ticket as resolved.")],
        ephemeral: true,
      });
    }
  }

  /**
   * Handle staff close button
   */
  private async handleStaffClose(interaction: ButtonInteraction): Promise<void> {
    const modmail = await this.getModmailOrGuard(interaction);
    if (!modmail) return;

    // Show close reason modal (includes optional final message field)
    const modalId = nanoid(12);

    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Close with Reason");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason for closing (optional)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter a reason for closing this ticket...")
      .setRequired(false)
      .setMaxLength(500);

    const finalMessageInput = new TextInputBuilder()
      .setCustomId("final_message")
      .setLabel("Final message to user (optional)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter a message to send to the user before closing...")
      .setRequired(false)
      .setMaxLength(1500);

    const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    const finalMessageRow = new ActionRowBuilder<TextInputBuilder>().addComponents(finalMessageInput);
    modal.addComponents(reasonRow, finalMessageRow);

    await interaction.showModal(modal);

    try {
      const submission = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
        time: 900_000,
      });

      await submission.deferReply({ ephemeral: true });

      const reason = submission.fields.getTextInputValue("reason") || undefined;
      const finalMessage = submission.fields.getTextInputValue("final_message") || undefined;
      const staffDisplayName = interaction.user.displayName || interaction.user.username;

      const result = await this.executeClose({
        modmail,
        closedBy: interaction.user.id,
        closedByDisplayName: staffDisplayName,
        reason,
        finalMessage,
        isStaff: true,
        staffAvatarURL: interaction.user.displayAvatarURL(),
      });

      if (result.success) {
        await submission.editReply({
          embeds: [ModmailEmbeds.success("Ticket Closed", "The modmail ticket has been closed.")],
        });

        if (result.dmFailed) {
          await submission
            .followUp({
              embeds: [ModmailEmbeds.warning("DM Not Sent", "Could not send DM to user (they may have DMs disabled).")],
              ephemeral: true,
            })
            .catch(() => {});
        }
      } else {
        await submission.editReply({
          embeds: [ModmailEmbeds.error("Failed", "Failed to close ticket.")],
        });
      }
    } catch (error) {
      // Modal timed out
      this.logger.debug(`Close modal timed out for ticket ${modmail.ticketNumber}`);
    }
  }

  /**
   * Handle staff ban button
   */
  private async handleStaffBan(interaction: ButtonInteraction): Promise<void> {
    const modmail = await this.getModmailOrGuard(interaction);
    if (!modmail) return;

    if (!this.supportCoreApi) {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("Unavailable", "Support ban system is not available.")],
        ephemeral: true,
      });
      return;
    }

    // Show ban modal
    const modalId = nanoid(12);

    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Ban User from Modmail");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Ban reason")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter the reason for banning this user from modmail...")
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(500);

    const durationInput = new TextInputBuilder()
      .setCustomId("duration")
      .setLabel("Duration (e.g., 7d, 30d, permanent)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Leave empty for permanent ban")
      .setRequired(false)
      .setMaxLength(20);

    const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    const durationRow = new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput);
    modal.addComponents(reasonRow, durationRow);

    await interaction.showModal(modal);

    try {
      const submission = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
        time: 900_000,
      });

      await this.handleBanModalSubmit(submission, modmail);
    } catch (error) {
      // Modal timed out
      this.logger.debug(`Ban modal timed out for ticket ${modmail.ticketNumber}`);
    }
  }

  /**
   * Process ban modal submission
   */
  private async handleBanModalSubmit(interaction: ModalSubmitInteraction, modmail: any): Promise<void> {
    await interaction.deferReply({ ephemeral: false });

    const reason = interaction.fields.getTextInputValue("reason");
    const durationString = interaction.fields.getTextInputValue("duration") || null;

    // Parse duration if provided
    let expiresAt: Date | undefined;
    if (durationString) {
      const parsed = this.lib.parseDuration(durationString);
      if (parsed) {
        expiresAt = new Date(Date.now() + parsed);
      }
    }

    if (!this.supportCoreApi) {
      await interaction.editReply({ embeds: [ModmailEmbeds.error("Unavailable", "Support ban system is not available.")] });
      return;
    }

    // Get user display name for audit trail
    const user = await this.lib.thingGetter.getUser(modmail.userId as string);
    const userDisplayName = user?.displayName || user?.username || modmail.userDisplayName || modmail.userId;

    try {
      const ban = await this.supportCoreApi.SupportBan.createBan({
        guildId: modmail.guildId as string,
        userId: modmail.userId as string,
        bannedBy: interaction.user.id,
        reason,
        userDisplayName,
        systemType: SupportBanSystem.MODMAIL,
        banType: expiresAt ? SupportBanType.TEMPORARY : SupportBanType.PERMANENT,
        expiresAt,
      });

      if (ban) {
        // Get guild name for user notification
        const guild = interaction.guild;
        const guildName = guild?.name || "the server";

        // Close the ticket after banning
        await this.modmailService.closeModmail({
          modmailId: modmail.modmailId as string,
          closedBy: interaction.user.id,
          reason: `User banned: ${reason}`,
          isStaff: true,
        });

        // Notify user they've been banned with rich embed
        if (user) {
          try {
            await user.send({
              embeds: [ModmailEmbeds.userBanned(guildName, reason, expiresAt)],
            });
          } catch {
            // User may have DMs disabled
          }
        }

        const expiryText = expiresAt ? `until <t:${Math.floor(expiresAt.getTime() / 1000)}:F>` : "permanently";

        await interaction.editReply({
          embeds: [ModmailEmbeds.success("User Banned", `User <@${modmail.userId}> has been banned from modmail ${expiryText}.\n\n**Reason:** ${reason}`)],
        });

        // Disable staff action buttons, lock, and archive the thread
        if (interaction.channelId) {
          await this.modmailService.finalizeThread(interaction.channelId, { banned: true });
        }
      } else {
        await interaction.editReply({
          embeds: [ModmailEmbeds.error("Failed", "Failed to ban user.")],
        });
      }
    } catch (error) {
      this.logger.error(`Failed to ban user ${modmail.userId}:`, error);
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Error", "An error occurred while banning the user.")],
      });
    }
  }

  // ========================================
  // PHASE 3: NEED MORE HELP & CLOSE WITH MESSAGE
  // ========================================

  /**
   * Handle user "I Need More Help" button (3.3)
   * Cancels the resolve auto-close timer and sends an SOS embed to staff.
   * Only works on RESOLVED tickets — does NOT reopen closed tickets.
   */
  private async handleNeedMoreHelp(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // Find the user's active modmail (open or resolved)
    const modmail = await this.modmailService.getActiveModmailForUser(interaction.user.id);

    if (!modmail) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Not Found", "You don't have an active support ticket.")],
      });
      return;
    }

    // Only works on resolved tickets — not already-open or closed ones
    if (modmail.status !== ModmailStatus.RESOLVED) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.info("Already Open", "Your ticket is already open. Staff will respond as soon as possible.")],
      });
      return;
    }

    // Cancel the resolve timer and set status back to OPEN
    const success = await this.modmailService.cancelResolveTimer(modmail.modmailId as string);

    if (success) {
      const userDisplayName = interaction.user.displayName || interaction.user.username;

      // Update starter message status back to Open
      await this.modmailService.updateStarterMessageStatus(modmail.forumThreadId as string, ModmailStatus.OPEN);

      // Send SOS embed to staff thread
      const sosEmbed = ModmailEmbeds.additionalHelpRequested(userDisplayName);
      const thread = await this.lib.thingGetter.getChannel(modmail.forumThreadId as string);
      if (thread?.isThread()) {
        await thread.send({ embeds: [sosEmbed] });
      }

      // Disable the resolve buttons on the original DM message
      try {
        if (interaction.message) {
          await interaction.message.edit({
            embeds: interaction.message.embeds,
            components: [], // Remove buttons
          });
        }
      } catch {
        // May not be able to edit the message
      }

      // Confirm to the user
      await interaction.editReply({
        embeds: [ModmailEmbeds.helpRequestSent()],
      });

      this.logger.info(`User ${interaction.user.id} requested more help on modmail ${modmail.modmailId}`);
    } else {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Failed", "Failed to send help request. Please send a new message to continue.")],
      });
    }
  }

  /**
   * Handle user "Close Ticket" button
   * Allows users to close their own modmail ticket from DM
   */
  private async handleUserClose(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // Find the user's active modmail (open OR resolved)
    const modmail = await this.modmailService.getActiveModmailForUser(interaction.user.id);

    if (!modmail) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Not Found", "You don't have an open support ticket to close.")],
      });
      return;
    }

    const userDisplayName = interaction.user.displayName || interaction.user.username;
    const closeReason = modmail.status === ModmailStatus.RESOLVED ? "Resolved - Closed by user" : "Closed by user";

    const result = await this.executeClose({
      modmail,
      closedBy: interaction.user.id,
      closedByDisplayName: userDisplayName,
      reason: closeReason,
      isStaff: false,
    });

    if (result.success) {
      // Remove buttons from the original DM message
      try {
        if (interaction.message) {
          await interaction.message.edit({
            embeds: interaction.message.embeds,
            components: [],
          });
        }
      } catch {
        // May not be able to edit the message
      }

      await interaction.editReply({
        embeds: [ModmailEmbeds.success("Ticket Closed", "Your support ticket has been closed.")],
      });
    } else {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Failed", "Failed to close ticket. Please try again or contact staff.")],
      });
    }
  }

  /**
   * Handle staff "Close with Message" button (legacy — backward compat for old DB components)
   * Shows a modal for final message, then delegates to executeClose
   */
  private async handleStaffCloseWithMessage(interaction: ButtonInteraction): Promise<void> {
    const modmail = await this.getModmailOrGuard(interaction);
    if (!modmail) return;

    // Show modal for final message and optional reason
    const modalId = nanoid(12);

    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Close with Final Message");

    const finalMessageInput = new TextInputBuilder()
      .setCustomId("final_message")
      .setLabel("Final message to user")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter a final message to send to the user before closing...")
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(1500);

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Internal close reason (optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Internal note for staff logs...")
      .setRequired(false)
      .setMaxLength(500);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(finalMessageInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    modal.addComponents(row1, row2);

    await interaction.showModal(modal);

    try {
      const submission = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
        time: 900_000,
      });

      await submission.deferReply({ ephemeral: true });

      const finalMessage = submission.fields.getTextInputValue("final_message");
      const reason = submission.fields.getTextInputValue("reason") || undefined;
      const staffDisplayName = interaction.user.displayName || interaction.user.username;

      const result = await this.executeClose({
        modmail,
        closedBy: interaction.user.id,
        closedByDisplayName: staffDisplayName,
        reason,
        finalMessage,
        isStaff: true,
        staffAvatarURL: interaction.user.displayAvatarURL(),
      });

      if (result.success) {
        await submission.editReply({
          embeds: [ModmailEmbeds.success("Ticket Closed", "The modmail ticket has been closed.")],
        });

        if (result.dmFailed) {
          await submission
            .followUp({
              embeds: [ModmailEmbeds.warning("DM Not Sent", "Could not send DM to user (they may have DMs disabled).")],
              ephemeral: true,
            })
            .catch(() => {});
        }
      } else {
        await submission.editReply({
          embeds: [ModmailEmbeds.error("Failed", "Failed to close ticket.")],
        });
      }
    } catch (error) {
      // Modal timed out
      this.logger.debug(`Close with message modal timed out for ticket ${modmail.ticketNumber}`);
    }
  }
}
