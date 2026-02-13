/**
 * /sticky set|remove|view|from-tag — Manage sticky messages in channels.
 *
 * A sticky message is automatically re-posted at the bottom of a channel
 * whenever a new message is sent, keeping it always visible.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type TextChannel, type NewsChannel } from "discord.js";
import type { CommandContext, AutocompleteContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ModerationPluginAPI } from "../index.js";
import type { TagsPluginAPI } from "../../tags/index.js";

export const data = new SlashCommandBuilder()
  .setName("sticky")
  .setDescription("Manage sticky messages that stay at the bottom of a channel")
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set a sticky message in a channel")
      .addStringOption((opt) => opt.setName("content").setDescription("The message content (max 2000 chars)").setRequired(true).setMaxLength(2000))
      .addChannelOption((opt) => opt.setName("channel").setDescription("Target channel (defaults to current)").setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addIntegerOption((opt) => opt.setName("color").setDescription("Embed colour (decimal). 0 or omit for plain text").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove the sticky message from a channel")
      .addChannelOption((opt) =>
        opt.setName("channel").setDescription("Target channel (defaults to current)").setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View the current sticky message in a channel")
      .addChannelOption((opt) =>
        opt.setName("channel").setDescription("Target channel (defaults to current)").setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("from-tag")
      .setDescription("Set a sticky message using a tag's content")
      .addStringOption((opt) => opt.setName("tag").setDescription("The tag name to use").setRequired(true).setAutocomplete(true))
      .addChannelOption((opt) => opt.setName("channel").setDescription("Target channel (defaults to current)").setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addIntegerOption((opt) => opt.setName("color").setDescription("Embed colour (decimal). 0 or omit for plain text").setRequired(false)),
  );

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");
  if (!mod) {
    await interaction.reply({ content: "Moderation plugin not loaded.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand(true);
  const channel = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel | NewsChannel;
  const guild = interaction.guild!;

  await interaction.deferReply({ ephemeral: true });

  switch (sub) {
    case "set": {
      const content = interaction.options.getString("content", true);
      const color = interaction.options.getInteger("color") ?? 0;

      await mod.stickyMessageService.setSticky(guild.id, channel.id, content, interaction.user.id, { color });

      const embed = mod.lib
        .createEmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("📌 Sticky Message Set")
        .addFields({ name: "Channel", value: `${channel}`, inline: true }, { name: "Content", value: content.length > 200 ? content.slice(0, 200) + "…" : content });

      await interaction.editReply({ embeds: [embed] });
      broadcastDashboardChange(guild.id, "moderation", "sticky_updated", { requiredAction: "moderation.manage_config" });
      break;
    }

    case "remove": {
      const removed = await mod.stickyMessageService.removeSticky(channel.id);
      if (!removed) {
        await interaction.editReply({
          embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("No sticky message found in that channel.")],
        });
        return;
      }

      await interaction.editReply({
        embeds: [mod.lib.createEmbedBuilder().setColor(0x22c55e).setTitle("📌 Sticky Message Removed").setDescription(`Sticky message removed from ${channel}.`)],
      });
      broadcastDashboardChange(guild.id, "moderation", "sticky_updated", { requiredAction: "moderation.manage_config" });
      break;
    }

    case "view": {
      const sticky = await mod.stickyMessageService.getSticky(channel.id);
      if (!sticky) {
        await interaction.editReply({
          embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("No sticky message found in that channel.")],
        });
        return;
      }

      const embed = mod.lib
        .createEmbedBuilder()
        .setColor(sticky.color && sticky.color > 0 ? sticky.color : 0x3b82f6)
        .setTitle(`📌 Sticky Message — #${channel.name}`)
        .addFields(
          { name: "Content", value: sticky.content },
          { name: "Status", value: sticky.enabled ? "✅ Active" : "⏸️ Disabled", inline: true },
          { name: "Set by", value: `<@${sticky.moderatorId}>`, inline: true },
        )
        .setTimestamp(sticky.createdAt);

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "from-tag": {
      const tagName = interaction.options.getString("tag", true);
      const color = interaction.options.getInteger("color") ?? 0;

      const tags = getPluginAPI<TagsPluginAPI>("tags");
      if (!tags) {
        await interaction.editReply({
          embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("Tags plugin is not loaded.")],
        });
        return;
      }

      const tag = await tags.tagService.getTag(guild.id, tagName);
      if (!tag) {
        await interaction.editReply({
          embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Tag \`${tagName}\` not found.`)],
        });
        return;
      }

      await mod.stickyMessageService.setSticky(guild.id, channel.id, tag.content, interaction.user.id, { color });

      const embed = mod.lib
        .createEmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("📌 Sticky Message Set from Tag")
        .addFields(
          { name: "Channel", value: `${channel}`, inline: true },
          { name: "Tag", value: `\`${tagName}\``, inline: true },
          { name: "Content", value: tag.content.length > 200 ? tag.content.slice(0, 200) + "…" : tag.content },
        );

      await interaction.editReply({ embeds: [embed] });
      broadcastDashboardChange(guild.id, "moderation", "sticky_updated", { requiredAction: "moderation.manage_config" });
      break;
    }
  }
}

/**
 * Autocomplete handler for the `tag` option in the `from-tag` subcommand.
 */
export async function autocomplete(context: AutocompleteContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tags = getPluginAPI<TagsPluginAPI>("tags");
  if (!tags) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused();
  const guildId = interaction.guildId!;
  const results = await tags.tagService.autocomplete(guildId, focused);
  await interaction.respond(results.slice(0, 25));
}
