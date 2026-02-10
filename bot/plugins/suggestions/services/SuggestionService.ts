/**
 * SuggestionService — Main business logic for the suggestion system
 * Handles suggestion creation, voting, management, and persistent interactions
 */

import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ChannelType,
  ThreadAutoArchiveDuration,
  type Message,
  type TextChannel,
  type ForumChannel,
  type AnyThreadChannel,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { nanoid } from "nanoid";
import Suggestion, { generateUniqueSuggestionId, SuggestionHelper, SuggestionStatus, VoteType, type ISuggestion } from "../models/Suggestion.js";
import { SuggestionConfigHelper, type ChannelConfig } from "../models/SuggestionConfig.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import type { GuildEnvService } from "../../../src/core/services/GuildEnvService.js";
import type { ComponentCallbackService } from "../../../src/core/services/ComponentCallbackService.js";
import { createLogger } from "../../../src/core/Logger.js";
import { createSuggestionEmbed, createSuggestionButtons, createManagementButtons, SuggestionButtonIds, SuggestionManagementButtonIds } from "../utils/SuggestionEmbeds.js";
import { canUserVote, setVoteCooldown, formatTimeRemaining, canUserSubmitSuggestion, setSubmissionCooldown } from "../utils/SuggestionValidation.js";
import { generateAISuggestionTitle, generateFallbackTitle } from "../utils/AIHelper.js";

const log = createLogger("suggestions:service");

export class SuggestionService {
  private client: HeimdallClient;
  private lib: LibAPI;
  private guildEnvService: GuildEnvService;
  private componentCallbackService: ComponentCallbackService;
  private isInitialized = false;

  constructor(client: HeimdallClient, lib: LibAPI, guildEnvService: GuildEnvService, componentCallbackService: ComponentCallbackService) {
    this.client = client;
    this.lib = lib;
    this.guildEnvService = guildEnvService;
    this.componentCallbackService = componentCallbackService;
  }

  /** Initialize the service and register persistent interaction handlers */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      log.warn("SuggestionService already initialized");
      return;
    }

    // Register upvote handler
    this.componentCallbackService.registerPersistentHandler(SuggestionButtonIds.UPVOTE, async (interaction) => {
      if (!interaction.isButton()) return;
      const metadata = await this.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const suggestionId = metadata?.suggestionId as string | undefined;
      if (!suggestionId) {
        await interaction.reply({ content: "❌ Invalid interaction data.", ephemeral: true });
        return;
      }
      await this.handleVote(interaction, suggestionId, VoteType.Upvote);
    });

    // Register downvote handler
    this.componentCallbackService.registerPersistentHandler(SuggestionButtonIds.DOWNVOTE, async (interaction) => {
      if (!interaction.isButton()) return;
      const metadata = await this.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const suggestionId = metadata?.suggestionId as string | undefined;
      if (!suggestionId) {
        await interaction.reply({ content: "❌ Invalid interaction data.", ephemeral: true });
        return;
      }
      await this.handleVote(interaction, suggestionId, VoteType.Downvote);
    });

    // Register manage button handler
    this.componentCallbackService.registerPersistentHandler(
      SuggestionButtonIds.MANAGE,
      async (interaction) => {
        if (!interaction.isButton()) return;
        const metadata = await this.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
        const suggestionId = metadata?.suggestionId as string | undefined;
        if (!suggestionId) {
          await interaction.reply({ content: "❌ Invalid interaction data.", ephemeral: true });
          return;
        }
        await this.showManagementMenu(interaction, suggestionId);
      },
      {
        actionKey: "interactions.suggestions.manage",
        label: "Manage Suggestions",
        description: "Open the suggestion management menu.",
      },
    );

    // Register management action handlers
    this.componentCallbackService.registerPersistentHandler(
      SuggestionManagementButtonIds.APPROVE,
      async (interaction) => {
        if (!interaction.isButton()) return;
        const metadata = await this.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
        const suggestionId = metadata?.suggestionId as string | undefined;
        if (!suggestionId) return;
        await this.handleManagement(interaction, suggestionId, "approve");
      },
      {
        actionKey: "interactions.suggestions.manage",
        label: "Manage Suggestions",
        description: "Approve, deny, or update suggestion status.",
      },
    );

    this.componentCallbackService.registerPersistentHandler(
      SuggestionManagementButtonIds.DENY,
      async (interaction) => {
        if (!interaction.isButton()) return;
        const metadata = await this.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
        const suggestionId = metadata?.suggestionId as string | undefined;
        if (!suggestionId) return;
        await this.handleManagement(interaction, suggestionId, "deny");
      },
      {
        actionKey: "interactions.suggestions.manage",
        label: "Manage Suggestions",
        description: "Approve, deny, or update suggestion status.",
      },
    );

    this.componentCallbackService.registerPersistentHandler(
      SuggestionManagementButtonIds.PENDING,
      async (interaction) => {
        if (!interaction.isButton()) return;
        const metadata = await this.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
        const suggestionId = metadata?.suggestionId as string | undefined;
        if (!suggestionId) return;
        await this.handleManagement(interaction, suggestionId, "pending");
      },
      {
        actionKey: "interactions.suggestions.manage",
        label: "Manage Suggestions",
        description: "Approve, deny, or update suggestion status.",
      },
    );

    this.componentCallbackService.registerPersistentHandler(
      SuggestionManagementButtonIds.CANCEL,
      async (interaction) => {
        if (!interaction.isButton()) return;
        const metadata = await this.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
        const suggestionId = metadata?.suggestionId as string | undefined;
        if (!suggestionId) return;
        await this.handleManagement(interaction, suggestionId, "cancel");
      },
      {
        actionKey: "interactions.suggestions.manage",
        label: "Manage Suggestions",
        description: "Approve, deny, or update suggestion status.",
      },
    );

    // Register opener dropdown handler
    this.componentCallbackService.registerPersistentHandler(
      "suggestion.opener",
      async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;
        const selectedChannelId = interaction.values[0];
        if (!selectedChannelId) return;
        await this.handleOpenerSelection(interaction, selectedChannelId);
      },
      {
        actionKey: "interactions.suggestions.manage",
        label: "Manage Suggestions",
        description: "Manage suggestion openers and configuration.",
      },
    );

    this.isInitialized = true;
    log.debug("SuggestionService initialized with persistent handlers");
  }

  /** Create a suggestion in embed mode */
  async createEmbedSuggestion(interaction: ModalSubmitInteraction, config: ChannelConfig, suggestion: string, reason: string, categoryId?: string): Promise<ISuggestion | null> {
    try {
      const title = config.enableAiTitles ? await generateAISuggestionTitle(suggestion, reason, interaction.guildId!, this.guildEnvService) : generateFallbackTitle(suggestion);

      const uniqueId = await generateUniqueSuggestionId();

      const channel = await this.client.channels.fetch(config.channelId);
      if (!channel || !channel.isTextBased() || channel.type !== ChannelType.GuildText) {
        log.error(`Invalid channel for embed suggestion: ${config.channelId}`);
        return null;
      }

      const textChannel = channel as TextChannel;

      const newSuggestion = new Suggestion({
        id: uniqueId,
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        channelId: config.channelId,
        mode: "embed",
        suggestion,
        reason,
        title,
        categoryId,
        status: SuggestionStatus.Pending,
        messageLink: "",
        votes: [],
      });

      const embed = createSuggestionEmbed(this.lib, newSuggestion);
      const buttons = createSuggestionButtons(this.lib, newSuggestion, 0, 0);
      await Promise.all([...buttons.components.map((button) => (button as any).ready())]);

      const message = await textChannel.send({ embeds: [embed], components: [buttons] });

      newSuggestion.messageLink = message.url;
      const savedSuggestion = await newSuggestion.save();

      await this.createDiscussionThread(message, savedSuggestion);
      log.info(`Created embed suggestion ${uniqueId} in guild ${interaction.guildId}`);
      return savedSuggestion;
    } catch (error) {
      log.error("Error creating embed suggestion:", error);
      return null;
    }
  }

  /** Create a suggestion in forum mode */
  async createForumSuggestion(interaction: ModalSubmitInteraction, config: ChannelConfig, suggestion: string, reason: string, categoryId?: string): Promise<ISuggestion | null> {
    try {
      const title = config.enableAiTitles ? await generateAISuggestionTitle(suggestion, reason, interaction.guildId!, this.guildEnvService) : generateFallbackTitle(suggestion);

      const uniqueId = await generateUniqueSuggestionId();

      const channel = await this.client.channels.fetch(config.channelId);
      if (!channel || channel.type !== ChannelType.GuildForum) {
        log.error(`Invalid channel for forum suggestion: ${config.channelId}`);
        return null;
      }

      const forumChannel = channel as ForumChannel;

      const newSuggestion = new Suggestion({
        id: uniqueId,
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        channelId: config.channelId,
        mode: "forum",
        suggestion,
        reason,
        title,
        categoryId,
        status: SuggestionStatus.Pending,
        messageLink: "",
        threadId: "",
        votes: [],
      });

      const embed = createSuggestionEmbed(this.lib, newSuggestion);
      const buttons = createSuggestionButtons(this.lib, newSuggestion, 0, 0);
      await Promise.all([...buttons.components.map((button) => (button as any).ready())]);

      const thread = await forumChannel.threads.create({
        name: `${title} [${uniqueId}]`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        message: { embeds: [embed], components: [buttons] },
      });

      const starterMessage = await thread.fetchStarterMessage();
      if (!starterMessage) {
        log.error("Failed to fetch starter message for forum thread");
        return null;
      }

      newSuggestion.threadId = thread.id;
      newSuggestion.firstMessageId = starterMessage.id;
      newSuggestion.messageLink = starterMessage.url;

      const savedSuggestion = await newSuggestion.save();

      await thread.send({
        content: `<@${interaction.user.id}> Thank you for your suggestion! Community members can vote above. Staff can manage this suggestion using the Manage button.`,
      });

      log.info(`Created forum suggestion ${uniqueId} in guild ${interaction.guildId}`);
      return savedSuggestion;
    } catch (error) {
      log.error("Error creating forum suggestion:", error);
      return null;
    }
  }

  /** Handle vote action (upvote or downvote) */
  private async handleVote(interaction: ButtonInteraction, suggestionId: string, voteType: VoteType): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const suggestion = await Suggestion.findOne({ id: suggestionId });
      if (!suggestion) {
        await interaction.editReply({ content: "This suggestion no longer exists." });
        return;
      }

      if (suggestion.status !== SuggestionStatus.Pending) {
        await interaction.editReply({ content: `This suggestion has been ${suggestion.status} and voting is closed.` });
        return;
      }

      const redis = this.client.redis || null;
      const cooldownCheck = await canUserVote(interaction.user.id, suggestionId, redis);

      if (!cooldownCheck.canProceed && cooldownCheck.remainingTime) {
        await interaction.editReply({
          content: `Please wait ${formatTimeRemaining(cooldownCheck.remainingTime)} before voting on this suggestion again.`,
        });
        return;
      }

      const existingVote = SuggestionHelper.getUserVote(suggestion, interaction.user.id);

      if (existingVote === voteType) {
        await interaction.editReply({
          content: `You have already ${voteType === VoteType.Upvote ? "upvoted" : "downvoted"} this suggestion.`,
        });
        return;
      }

      if (existingVote) {
        await Suggestion.updateOne({ id: suggestionId, "votes.userId": interaction.user.id }, { $set: { "votes.$.vote": voteType, "votes.$.votedAt": new Date() } });
      } else {
        await Suggestion.updateOne({ id: suggestionId }, { $push: { votes: { userId: interaction.user.id, vote: voteType, votedAt: new Date() } } });
      }

      const guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);
      const voteCooldown = guildConfig?.voteCooldown || 60;
      await setVoteCooldown(interaction.user.id, suggestionId, redis, voteCooldown);

      const voteAction = existingVote ? "changed to" : "counted as";
      await interaction.editReply({
        content: `Your ${voteType === VoteType.Upvote ? "upvote" : "downvote"} has been ${voteAction}!\n-# The message will update shortly to reflect all votes.`,
      });

      await this.updateVoteDisplay(suggestionId);
    } catch (error) {
      log.error("Error handling vote:", error);
      await interaction.editReply({ content: "An error occurred while processing your vote. Please try again later." });
    }
  }

  /** Update vote counts on the suggestion message */
  async updateVoteDisplay(suggestionId: string): Promise<void> {
    try {
      const suggestion = await Suggestion.findOne({ id: suggestionId });
      if (!suggestion) return;

      const { upvotes, downvotes } = SuggestionHelper.getVoteCounts(suggestion);

      let message: Message | null = null;

      if (suggestion.mode === "embed") {
        const channel = await this.client.channels.fetch(suggestion.channelId);
        if (!channel || !channel.isTextBased()) return;

        const messageId = suggestion.messageLink.split("/").pop();
        if (!messageId) return;

        message = await (channel as TextChannel).messages.fetch(messageId);
      } else {
        if (!suggestion.threadId || !suggestion.firstMessageId) return;

        const thread = await this.client.channels.fetch(suggestion.threadId);
        if (!thread || !thread.isThread()) return;

        message = await (thread as AnyThreadChannel).messages.fetch(suggestion.firstMessageId);
      }

      if (!message) return;

      const embed = createSuggestionEmbed(this.lib, suggestion);
      const buttons = createSuggestionButtons(this.lib, suggestion, upvotes, downvotes);
      await Promise.all([...buttons.components.map((button) => (button as any).ready())]);

      await message.edit({ embeds: [embed], components: [buttons] });
      log.debug(`Updated vote display for suggestion ${suggestionId}: ${upvotes} upvotes, ${downvotes} downvotes`);
    } catch (error) {
      log.error(`Error updating vote display for suggestion ${suggestionId}:`, error);
    }
  }

  /** Handle management actions (approve/deny/pending/cancel) */
  private async handleManagement(interaction: ButtonInteraction, suggestionId: string, action: string): Promise<void> {
    try {
      const suggestion = await Suggestion.findOne({ id: suggestionId });
      if (!suggestion) {
        await interaction.reply({ content: "This suggestion no longer exists.", ephemeral: true });
        return;
      }

      // Cancel doesn't need permission check
      if (action !== "cancel" && !(await this.checkManagePermission(interaction, suggestion.channelId))) {
        await interaction.reply({ content: "❌ You need the **Manage Messages** permission in the suggestion channel to manage suggestions.", ephemeral: true });
        return;
      }

      switch (action) {
        case "approve":
          await this.updateSuggestionStatus(interaction, suggestion, SuggestionStatus.Approved);
          break;
        case "deny":
          await this.updateSuggestionStatus(interaction, suggestion, SuggestionStatus.Denied);
          break;
        case "pending":
          await this.updateSuggestionStatus(interaction, suggestion, SuggestionStatus.Pending);
          break;
        case "cancel":
          await interaction.update({ content: "Action cancelled.", components: [] });
          break;
        default:
          await interaction.reply({ content: "Unknown management action.", ephemeral: true });
      }
    } catch (error) {
      log.error("Error handling management:", error);
      await interaction.reply({ content: "An error occurred while managing this suggestion.", ephemeral: true });
    }
  }

  /** Check if the user has ManageMessages in the suggestion's channel */
  private async checkManagePermission(interaction: ButtonInteraction, channelId: string): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !("permissionsFor" in channel)) return false;
      const member = interaction.guild?.members.cache.get(interaction.user.id) ?? (await interaction.guild?.members.fetch(interaction.user.id));
      if (!member) return false;
      const perms = (channel as TextChannel | ForumChannel).permissionsFor(member);
      return perms?.has(PermissionFlagsBits.ManageMessages) ?? false;
    } catch {
      return false;
    }
  }

  /** Show management menu */
  private async showManagementMenu(interaction: ButtonInteraction, suggestionId: string): Promise<void> {
    const suggestion = await Suggestion.findOne({ id: suggestionId });
    if (!suggestion) {
      await interaction.reply({ content: "This suggestion no longer exists.", ephemeral: true });
      return;
    }

    if (!(await this.checkManagePermission(interaction, suggestion.channelId))) {
      await interaction.reply({ content: "❌ You need the **Manage Messages** permission in the suggestion channel to manage suggestions.", ephemeral: true });
      return;
    }

    const buttons = createManagementButtons(this.lib, suggestionId);
    await Promise.all([...buttons.components.map((button) => (button as any).ready())]);
    await interaction.reply({ content: "Select an action:", components: [buttons], ephemeral: true });
  }

  /** Update suggestion status */
  private async updateSuggestionStatus(interaction: ButtonInteraction, suggestion: ISuggestion, newStatus: SuggestionStatus): Promise<void> {
    try {
      await Suggestion.updateOne({ id: suggestion.id }, { status: newStatus, managedBy: interaction.user.id, updatedAt: new Date() });

      await interaction.update({ content: `Suggestion ${newStatus}!`, components: [] });
      await this.updateVoteDisplay(suggestion.id);
      log.info(`Suggestion ${suggestion.id} ${newStatus} by ${interaction.user.id}`);
    } catch (error) {
      log.error(`Error updating suggestion status:`, error);
      throw error;
    }
  }

  /** Create discussion thread for embed mode suggestion */
  private async createDiscussionThread(message: Message, suggestion: ISuggestion): Promise<void> {
    try {
      if (message.hasThread) return;

      const thread = await message.startThread({
        name: `Discussion: ${suggestion.title}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      });

      await thread.send({
        content: `<@${suggestion.userId}> This thread has been created for discussion about your suggestion. Please keep the discussion respectful and constructive!`,
      });

      log.debug(`Created discussion thread for suggestion ${suggestion.id}`);
    } catch (error) {
      log.error(`Error creating discussion thread:`, error);
    }
  }

  /** Handle channel deletion cleanup */
  async handleChannelDelete(channelId: string): Promise<void> {
    try {
      const suggestions = await Suggestion.find({ channelId });
      if (suggestions.length === 0) return;

      const guildId = suggestions[0]?.guildId;
      if (!guildId) return;

      for (const suggestion of suggestions) {
        if (suggestion.id) {
          await Suggestion.deleteOne({ id: suggestion.id });
          log.debug(`Deleted suggestion ${suggestion.id} for channel cleanup`);
        }
      }

      await SuggestionConfigHelper.removeChannel(guildId, channelId);
      log.info(`Cleaned up suggestion channel ${channelId}`);
    } catch (error) {
      log.error(`Error handling channel delete:`, error);
    }
  }

  /** Handle thread deletion cleanup (forum mode) */
  async handleThreadDelete(threadId: string): Promise<void> {
    try {
      const suggestion = await Suggestion.findOne({ threadId });
      if (!suggestion) return;

      await Suggestion.deleteOne({ threadId });
      log.info(`Cleaned up suggestion thread ${threadId}`);
    } catch (error) {
      log.error(`Error handling thread delete:`, error);
    }
  }

  /** Handle opener dropdown selection — shows category selection or submission modal */
  async handleOpenerSelection(interaction: any, selectedChannelId: string, selectedCategoryId?: string): Promise<void> {
    try {
      const channelConfig = await SuggestionConfigHelper.getChannelConfig(selectedChannelId);

      if (!channelConfig) {
        await interaction.reply({
          content: "❌ This suggestion channel is no longer configured. Please contact an administrator.",
          ephemeral: true,
        });
        return;
      }

      const guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);

      // If categories enabled and none selected yet, show category selection
      if (guildConfig?.enableCategories && !selectedCategoryId) {
        await this.showCategorySelection(interaction, selectedChannelId);
        return;
      }

      // Check cooldown (bypass for ManageGuild)
      const submissionCooldown = guildConfig?.submissionCooldown || 3600;
      const member = await this.lib.thingGetter.getMember(interaction.guild!, interaction.user.id);
      const hasManageGuild = member?.permissions.has(PermissionFlagsBits.ManageGuild);

      if (!hasManageGuild) {
        const cooldownCheck = await canUserSubmitSuggestion(interaction.user.id, interaction.guildId!, this.client.redis, submissionCooldown);

        if (!cooldownCheck.canProceed && cooldownCheck.remainingTime) {
          await interaction.reply({
            content: `⏳ Please wait ${formatTimeRemaining(cooldownCheck.remainingTime)} before submitting another suggestion.`,
            ephemeral: true,
          });
          return;
        }
      }

      // Show the suggestion modal
      const modalId = nanoid();
      const modal = new ModalBuilder().setCustomId(modalId).setTitle("Submit a Suggestion");

      const suggestionInput = new TextInputBuilder()
        .setCustomId("suggestionInput")
        .setLabel("What's your suggestion?")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(20)
        .setMaxLength(1000)
        .setRequired(true);

      const reasonInput = new TextInputBuilder().setCustomId("reasonInput").setLabel("Why should we add this?").setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(500).setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(suggestionInput), new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

      await interaction.showModal(modal);

      const modalSubmit = await interaction
        .awaitModalSubmit({
          filter: (i: any) => i.user.id === interaction.user.id && i.customId === modalId,
          time: 900_000,
        })
        .catch(() => null);

      if (!modalSubmit) return;

      await modalSubmit.deferReply({ ephemeral: true });

      const suggestion = modalSubmit.fields.getTextInputValue("suggestionInput");
      const reason = modalSubmit.fields.getTextInputValue("reasonInput");

      try {
        let result: ISuggestion | null = null;

        if (channelConfig.mode === "forum") {
          result = await this.createForumSuggestion(modalSubmit, channelConfig, suggestion, reason, selectedCategoryId);
        } else {
          result = await this.createEmbedSuggestion(modalSubmit, channelConfig, suggestion, reason, selectedCategoryId);
        }

        if (result) {
          if (!hasManageGuild) {
            await setSubmissionCooldown(interaction.user.id, interaction.guildId!, this.client.redis, submissionCooldown);
          }
          await modalSubmit.editReply({ content: "✅ Your suggestion has been submitted successfully!" });
        } else {
          await modalSubmit.editReply({ content: "❌ Failed to submit suggestion. Please try again later." });
        }
      } catch (error) {
        log.error("Error processing suggestion modal submission:", error);
        await modalSubmit.editReply({ content: "❌ An error occurred while processing your suggestion. Please try again later." });
      }
    } catch (error) {
      log.error("Error handling opener selection:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ An error occurred while opening the suggestion form. Please try again.", ephemeral: true });
      }
    }
  }

  /** Show category selection menu for suggestions */
  private async showCategorySelection(interaction: any, selectedChannelId: string): Promise<void> {
    try {
      const categories = await SuggestionConfigHelper.getActiveCategories(interaction.guildId!, selectedChannelId);

      if (categories.length === 0) {
        await interaction.reply({
          content: "❌ No categories are available for this channel. Please contact an administrator.",
          ephemeral: true,
        });
        return;
      }

      const selectMenu = this.lib.createStringSelectMenuBuilder(async (selectInteraction) => {
        const selectedValue = selectInteraction.values[0];
        if (!selectedValue) return;

        const [channelIdFromSelect, categoryIdFromSelect] = selectedValue.split(":");
        if (!channelIdFromSelect || !categoryIdFromSelect) return;

        await this.handleOpenerSelection(selectInteraction, channelIdFromSelect, categoryIdFromSelect);
      }, 300);

      selectMenu.setPlaceholder("Select a category for your suggestion").setMinValues(1).setMaxValues(1);

      for (const category of categories) {
        const option = new StringSelectMenuOptionBuilder().setLabel(category.name).setValue(`${selectedChannelId}:${category.id}`).setDescription(category.description);

        if (category.emoji) option.setEmoji(category.emoji);
        selectMenu.addOptions(option);
      }

      await selectMenu.ready();

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = this.lib
        .createEmbedBuilder()
        .setTitle("📂 Select Suggestion Category")
        .setDescription("Please choose the category that best describes your suggestion:")
        .setColor(0x0099ff)
        .setTimestamp();

      if (categories.length <= 5) {
        for (const category of categories) {
          embed.addFields([{ name: `${category.emoji || "📁"} ${category.name}`, value: category.description, inline: true }]);
        }
      }

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    } catch (error) {
      log.error("Failed to show category selection:", error);
      const replyMethod = interaction.deferred || interaction.replied ? "editReply" : "reply";
      await interaction[replyMethod]({ content: "❌ Failed to show categories. Please try again.", ephemeral: true });
    }
  }
}
