/**
 * TicketInteractionService - Handles persistent UI interactions
 */

import type { GuildMember, TextChannel } from "discord.js";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonStyle, PermissionFlagsBits } from "discord.js";
import { nanoid } from "nanoid";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import { TicketFlowService } from "./TicketFlowService.js";
import { TicketLifecycleService } from "./TicketLifecycleService.js";
import { TicketSessionService } from "./TicketSessionService.js";
import TicketCategory from "../models/TicketCategory.js";
import Ticket from "../models/Ticket.js";
import { InteractionFlow } from "../utils/InteractionFlow.js";
import { handleSelectAnswer, handleModalContinue, handleModalEdit } from "../utils/TicketQuestionHandler.js";
import { TicketStatus } from "../types/index.js";

export class TicketInteractionService {
  private isInitialized = false;

  constructor(
    private client: HeimdallClient,
    private logger: PluginLogger,
    private lib: LibAPI,
    private flowService: TicketFlowService,
    private lifecycleService: TicketLifecycleService,
    private sessionService: TicketSessionService,
  ) {}

  /**
   * Register all persistent interaction handlers
   */
  async registerHandlers(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn("TicketInteractionService already initialized");
      return;
    }

    // Handler: Opener category selection (buttons and dropdown)
    this.lib.componentCallbackService.registerPersistentHandler("ticket.opener.category", async (interaction) => {
      if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      if (!metadata?.guildId) {
        await interaction.reply({ content: "❌ Invalid interaction data.", ephemeral: true });
        return;
      }

      const categoryId = interaction.isButton() ? (metadata.categoryId as string) : interaction.values[0];
      if (!categoryId) {
        await interaction.reply({ content: "❌ No category selected.", ephemeral: true });
        return;
      }

      try {
        await this.flowService.openTicketForUser(categoryId, interaction.user.id, (metadata.openerId as string) || "direct", interaction, undefined);
      } catch (error) {
        this.logger.error("Error opening ticket from opener:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ An error occurred while opening your ticket.", ephemeral: true });
        }
      }
    });

    // Handler: Ticket Control - Close
    this.lib.componentCallbackService.registerPersistentHandler("ticket.control.close", async (interaction) => {
      if (!interaction.isButton()) return;

      const flow = new InteractionFlow(interaction);
      const ticket = await this.getTicketFromChannel(interaction.channelId);
      if (!ticket) {
        await flow.send({ content: "❌ Could not find ticket.", ephemeral: true });
        return;
      }

      if (ticket.status === TicketStatus.ARCHIVED || ticket.status === TicketStatus.CLOSED) {
        await flow.send({ content: "❌ This ticket is already closed.", ephemeral: true });
        return;
      }

      // Build confirmation buttons
      const confirmBtn = this.lib.createButtonBuilder(async (i) => {
        const iFlow = new InteractionFlow(i);
        const t = await this.getTicketFromChannel(i.channelId);
        if (!t) return;

        await iFlow.update({ content: "⏳ Closing ticket...", components: [] });
        const result = await this.lifecycleService.closeTicket(t, i.user, i.member as GuildMember);
        await iFlow.show({ content: result.success ? "✅ Ticket closed successfully." : `❌ ${result.message}`, components: [] });
      }, 300);
      confirmBtn.setLabel("Confirm Close").setStyle(ButtonStyle.Danger).setEmoji("🔒");

      const reasonBtn = this.lib.createButtonBuilder(async (i) => {
        const modalId = nanoid();
        const modal = new ModalBuilder().setCustomId(modalId).setTitle("Close Ticket");
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Reason").setStyle(TextInputStyle.Paragraph).setRequired(true)),
        );

        await i.showModal(modal);

        const submit = await i
          .awaitModalSubmit({
            filter: (s) => s.customId === modalId && s.user.id === i.user.id,
            time: 300000,
          })
          .catch(() => null);

        if (submit) {
          const sFlow = new InteractionFlow(submit);
          const ticket = await this.getTicketFromChannel(submit.channelId);
          if (ticket) {
            const reason = submit.fields.getTextInputValue("reason");
            const result = await this.lifecycleService.closeTicket(ticket, submit.user, submit.member as GuildMember, reason);
            await sFlow.update({ content: result.success ? "✅ Ticket closed." : `❌ ${result.message}`, components: [] });
          } else {
            await sFlow.update({ content: "❌ Could not find ticket.", components: [] });
          }
        }
      }, 300);
      reasonBtn.setLabel("Close with Reason").setStyle(ButtonStyle.Primary).setEmoji("📝");

      const cancelBtn = this.lib.createButtonBuilder(async (i) => {
        const cFlow = new InteractionFlow(i);
        await cFlow.update({ content: "Action cancelled.", components: [] });
      }, 300);
      cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary).setEmoji("✖️");

      await Promise.all([confirmBtn.ready(), reasonBtn.ready(), cancelBtn.ready()]);

      await flow.send({
        content: "Are you sure you want to close this ticket?",
        components: [new ActionRowBuilder<any>().addComponents(confirmBtn, reasonBtn, cancelBtn)],
        ephemeral: true,
      });
    });

    // Handler: Ticket Control - Claim
    this.lib.componentCallbackService.registerPersistentHandler("ticket.control.claim", async (interaction) => {
      if (!interaction.isButton()) return;
      const flow = new InteractionFlow(interaction);

      const ticket = await this.getTicketFromChannel(interaction.channelId);
      if (!ticket) {
        await flow.send({ content: "❌ Could not find ticket.", ephemeral: true });
        return;
      }

      if (ticket.status === TicketStatus.ARCHIVED || ticket.status === TicketStatus.CLOSED) {
        await flow.send({ content: "❌ This ticket is already closed.", ephemeral: true });
        return;
      }

      await flow.send({ content: "⏳ Claiming ticket...", ephemeral: true });
      const result = await this.lifecycleService.claimTicket(ticket, interaction.user, interaction.member as GuildMember);
      await flow.show({ content: result.success ? `✅ ${result.message}` : `❌ ${result.message}` });
    });

    // Handler: Ticket Control - Manage (unclaim, move, rename, add user)
    this.lib.componentCallbackService.registerPersistentHandler("ticket.control.manage", async (interaction) => {
      if (!interaction.isButton()) return;
      const flow = new InteractionFlow(interaction);

      const ticket = await this.getTicketFromChannel(interaction.channelId);
      if (!ticket) {
        await flow.send({ content: "❌ Could not find ticket.", ephemeral: true });
        return;
      }

      if (ticket.status === TicketStatus.ARCHIVED || ticket.status === TicketStatus.CLOSED) {
        await flow.send({ content: "❌ This ticket is already closed.", ephemeral: true });
        return;
      }

      const category = await TicketCategory.findOne({ id: ticket.categoryId, guildId: ticket.guildId });
      if (!category || !this.hasStaffPermission(interaction.member as GuildMember, category)) {
        await flow.send({ content: "❌ You do not have permission to manage this ticket.", ephemeral: true });
        return;
      }

      // Build manage menu
      const menu = this.lib.createStringSelectMenuBuilder(async (i) => {
        const iFlow = new InteractionFlow(i);
        const value = i.values[0];

        if (value === "unclaim") {
          await iFlow.update({ content: "⏳ Unclaiming ticket...", components: [] });
          const res = await this.lifecycleService.unclaimTicket(ticket, i.user, i.member as GuildMember);
          await iFlow.show({ content: res.success ? `✅ ${res.message}` : `❌ ${res.message}` });
        } else if (value === "rename") {
          const modalId = nanoid();
          const modal = new ModalBuilder().setCustomId(modalId).setTitle("Rename Ticket");
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("name")
                .setLabel("New Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(ticket.customChannelName || `ticket-${ticket.ticketNumber}`),
            ),
          );
          await i.showModal(modal);

          const submit = await i
            .awaitModalSubmit({
              filter: (s) => s.customId === modalId && s.user.id === i.user.id,
              time: 300000,
            })
            .catch(() => null);

          if (submit) {
            const sFlow = new InteractionFlow(submit);
            const name = submit.fields.getTextInputValue("name");
            const res = await this.lifecycleService.renameTicket(ticket, name, submit.user, submit.member as GuildMember);
            await sFlow.update({ content: res.success ? `✅ ${res.message}` : `❌ ${res.message}`, components: [] });
          }
        }
        // TODO: Add more manage options (move, adduser) in step 7e
      }, 300);

      menu.setPlaceholder("Select action...").addOptions([
        { label: "Unclaim", value: "unclaim", emoji: "🔓", description: "Remove your claim on this ticket" },
        { label: "Rename", value: "rename", emoji: "✏️", description: "Rename the ticket channel" },
        // More options added in step 7e
      ]);

      await menu.ready();

      await flow.send({
        content: "Select a management action:",
        components: [new ActionRowBuilder<any>().addComponents(menu)],
        ephemeral: true,
      });
    });

    // Handler: Question select menu answer
    this.lib.componentCallbackService.registerPersistentHandler("ticket.question.select", async (interaction) => {
      if (!interaction.isStringSelectMenu()) return;

      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      if (!metadata?.sessionId || !metadata?.questionId) {
        await interaction.reply({ content: "❌ Invalid interaction data.", ephemeral: true });
        return;
      }

      const sessionId = metadata.sessionId as string;
      const questionId = metadata.questionId as string;

      try {
        const session = await this.sessionService.getSession(sessionId);
        if (!session) {
          await interaction.reply({ content: "❌ Session expired. Please start again.", ephemeral: true });
          return;
        }

        const category = await TicketCategory.findOne({ id: session.categoryId });
        if (!category) {
          await interaction.reply({ content: "❌ Category not found.", ephemeral: true });
          return;
        }

        await handleSelectAnswer(this.client, this.lib, interaction, sessionId, questionId, this.sessionService, this.lifecycleService, category, this.logger);
      } catch (error) {
        this.logger.error("Error handling select question:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ An error occurred.", ephemeral: true });
        }
      }
    });

    // Handler: Modal continue button
    this.lib.componentCallbackService.registerPersistentHandler("ticket.modal.continue", async (interaction) => {
      if (!interaction.isButton()) return;

      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      if (!metadata?.sessionId) {
        await interaction.reply({ content: "❌ Invalid interaction data.", ephemeral: true });
        return;
      }

      const sessionId = metadata.sessionId as string;
      const modalPage = (metadata.modalPage as number) ?? 0;

      try {
        await handleModalContinue(this.client, this.lib, interaction, sessionId, modalPage, this.sessionService, this.lifecycleService, this.logger);
      } catch (error) {
        this.logger.error("Error handling modal continue:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ An error occurred.", ephemeral: true });
        }
      }
    });

    // Handler: Modal edit button
    this.lib.componentCallbackService.registerPersistentHandler("ticket.modal.edit", async (interaction) => {
      if (!interaction.isButton()) return;

      const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      if (!metadata?.sessionId) {
        await interaction.reply({ content: "❌ Invalid interaction data.", ephemeral: true });
        return;
      }

      const sessionId = metadata.sessionId as string;
      const modalPage = (metadata.modalPage as number) ?? 0;

      try {
        await handleModalEdit(this.lib, interaction, sessionId, modalPage, this.sessionService, this.logger);
      } catch (error) {
        this.logger.error("Error handling modal edit:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ An error occurred.", ephemeral: true });
        }
      }
    });

    this.isInitialized = true;
    this.logger.info("TicketInteractionService handlers registered");
  }

  /**
   * Get ticket from channel ID
   */
  private async getTicketFromChannel(channelId: string | null): Promise<typeof Ticket.prototype | null> {
    if (!channelId) return null;
    return Ticket.findOne({ channelId, status: { $nin: [TicketStatus.ARCHIVED] } });
  }

  /**
   * Check if member has staff permission for category
   */
  private hasStaffPermission(member: GuildMember, category: typeof TicketCategory.prototype): boolean {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return category.staffRoles?.some((sr: any) => member.roles.cache.has(sr.roleId)) ?? false;
  }
}
