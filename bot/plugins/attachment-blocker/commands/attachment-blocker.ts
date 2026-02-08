/**
 * /attachment-blocker command — Configure attachment blocking rules per-guild and per-channel.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("attachment-blocker")
  .setDescription("Manage attachment blocking rules for channels")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
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
            { name: "Videos & GIFs", value: "video" },
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
          .addChannelOption((opt) => opt.setName("channel").setDescription("Target channel").setRequired(true))
          .addStringOption((opt) =>
            opt
              .setName("type")
              .setDescription("Attachment type to whitelist in this channel")
              .setRequired(true)
              .addChoices(
                { name: "Images", value: "image" },
                { name: "Videos & GIFs", value: "video" },
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
          .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to remove override from").setRequired(true)),
      ),
  )
  .addSubcommand((sub) => sub.setName("view").setDescription("View current attachment blocking configuration"))
  .addSubcommand((sub) => sub.setName("disable").setDescription("Disable attachment blocking guild-wide"));

export const config = {
  allowInDMs: false,
};

// Execution handled by subcommands/attachment-blocker/index.ts
