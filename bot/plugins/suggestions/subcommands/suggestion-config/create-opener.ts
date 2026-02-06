/**
 * /suggestion-config create-opener — Create a suggestion opener dropdown in a channel
 */

import { ActionRowBuilder, ChannelType, StringSelectMenuOptionBuilder } from "discord.js";
import type { TextChannel } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import SuggestionOpener from "../../models/SuggestionOpener.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:create-opener");

export async function handleCreateOpener(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = interaction.options.getChannel("channel", true);
    const title = interaction.options.getString("title") || "Submit a Suggestion";
    const description = interaction.options.getString("description") || "Select a category below to submit your suggestion. Your feedback helps us improve!";

    const guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);

    if (!guildConfig || guildConfig.channels.length === 0) {
      await interaction.editReply("❌ No suggestion channels configured yet. Use `/suggestion-config add-channel` first.");
      return;
    }

    const existingOpener = await SuggestionOpener.findOne({
      guildId: interaction.guildId!,
      channelId: channel.id,
    });

    if (existingOpener) {
      await interaction.editReply(`❌ A suggestion opener already exists in <#${channel.id}>.\n\nRemove it first with \`/suggestion-config remove-opener\`.`);
      return;
    }

    // Build dropdown with all suggestion channels
    const options = guildConfig.channels.map((ch) => {
      const channelObj = interaction.guild?.channels.cache.get(ch.channelId);
      return new StringSelectMenuOptionBuilder()
        .setLabel(channelObj?.name || `Channel ${ch.channelId}`)
        .setDescription(`${ch.mode} mode${ch.enableAiTitles ? " • AI titles" : ""}`)
        .setValue(ch.channelId)
        .setEmoji(ch.mode === "forum" ? "📋" : "💬");
    });

    // Create persistent opener select menu
    const customId = await pluginAPI.componentCallbackService.createPersistentComponent("suggestion.opener", "selectMenu", { guildId: interaction.guildId });

    // Build the select menu with the custom ID directly
    const { StringSelectMenuBuilder } = await import("discord.js");
    const dropdown = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder("Select a suggestion channel...").addOptions(options);

    const row = new ActionRowBuilder<typeof dropdown>().addComponents(dropdown);

    const embed = pluginAPI.lib.createEmbedBuilder().setColor("Blue").setTitle(title).setDescription(description).setFooter({ text: "Select a channel to begin" }).setTimestamp();

    // Post the opener message
    const targetChannel = await interaction.guild?.channels.fetch(channel.id);
    if (!targetChannel?.isTextBased()) {
      await interaction.editReply("❌ The target channel must be a text channel.");
      return;
    }

    const openerMessage = await (targetChannel as TextChannel).send({
      embeds: [embed],
      components: [row as any],
    });

    // Save to database
    await SuggestionOpener.create({
      guildId: interaction.guildId!,
      channelId: channel.id,
      messageId: openerMessage.id,
      title,
      description,
      createdBy: interaction.user.id,
    });

    await interaction.editReply(`✅ Suggestion opener created in <#${channel.id}>!\n\nUsers can now select a channel to submit suggestions.`);

    log.info(`Created suggestion opener in channel ${channel.id} for guild ${interaction.guildId}`);
  } catch (error) {
    log.error("Error creating suggestion opener:", error);
    await interaction.editReply("❌ An error occurred while creating the opener. Please try again later.");
  }
}
