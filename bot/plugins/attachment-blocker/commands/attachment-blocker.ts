/**
 * /attachment-blocker command — Configure attachment blocking rules per-guild and per-channel.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("attachment-blocker")
  .setDescription("Manage attachment blocking rules for channels")
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Configure guild-wide attachment blocking defaults")
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Attachment type to whitelist (guild-wide default)")
          .setRequired(true)
          .addChoices(
            { name: "Images", value: "image" },
            { name: "Videos", value: "video" },
            { name: "GIFs", value: "gif" },
            { name: "Audio", value: "audio" },
            { name: "All (allow everything)", value: "all" },
            { name: "None (block everything)", value: "none" },
          ),
      )
      .addIntegerOption((opt) => opt.setName("timeout").setDescription("Timeout duration in seconds for violators (0 = no timeout)").setMinValue(0).setMaxValue(604800)),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("channel")
      .setDescription("Manage per-channel overrides")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add or update a channel-specific override")
          .addChannelOption((opt) =>
            opt.setName("channel").setDescription("Target channel").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
          )
          .addStringOption((opt) =>
            opt
              .setName("type")
              .setDescription("Attachment type to whitelist in this channel")
              .setRequired(true)
              .addChoices(
                { name: "Images", value: "image" },
                { name: "Videos", value: "video" },
                { name: "GIFs", value: "gif" },
                { name: "Audio", value: "audio" },
                { name: "All (allow everything)", value: "all" },
                { name: "None (block everything)", value: "none" },
              ),
          )
          .addIntegerOption((opt) => opt.setName("timeout").setDescription("Timeout duration override in seconds (0 = no timeout)").setMinValue(0).setMaxValue(604800)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a channel override (revert to guild defaults)")
          .addChannelOption((opt) =>
            opt.setName("channel").setDescription("Channel to remove override from").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
          ),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("bypass")
      .setDescription("Manage role-based bypasses")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a global bypass role")
          .addRoleOption((opt) => opt.setName("role").setDescription("Role to bypass all attachment checks").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a global bypass role")
          .addRoleOption((opt) => opt.setName("role").setDescription("Role to remove from global bypass").setRequired(true)),
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List global bypass roles"))
      .addSubcommand((sub) =>
        sub
          .setName("channel-add")
          .setDescription("Add a bypass role for a specific channel")
          .addChannelOption((opt) =>
            opt.setName("channel").setDescription("Target channel").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
          )
          .addRoleOption((opt) => opt.setName("role").setDescription("Role to bypass checks in this channel").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("channel-remove")
          .setDescription("Remove a bypass role from a specific channel")
          .addChannelOption((opt) =>
            opt.setName("channel").setDescription("Target channel").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
          )
          .addRoleOption((opt) => opt.setName("role").setDescription("Role to remove from this channel bypass").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("channel-list")
          .setDescription("List bypass roles for a specific channel")
          .addChannelOption((opt) =>
            opt.setName("channel").setDescription("Target channel").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
          ),
      ),
  )
  .addSubcommand((sub) => sub.setName("view").setDescription("View current attachment blocking configuration"))
  .addSubcommand((sub) => sub.setName("disable").setDescription("Disable attachment blocking guild-wide"));

export const config = {
  allowInDMs: false,
};

// Execution handled by subcommands/attachment-blocker/index.ts
