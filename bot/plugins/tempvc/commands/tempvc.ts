/**
 * /tempvc command — Setup and manage temporary voice channels
 *
 * Subcommands:
 * - create  — Configure a voice channel as a join-to-create creator
 * - delete  — Remove a creator channel configuration
 * - delete-all — Remove all creator channels for this server
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("tempvc")
  .setDescription("Setup and manage temporary voice channels")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Setup a channel that creates temporary voice channels when users join")
      .addChannelOption((opt) => opt.setName("channel").setDescription("The voice channel users will join to create a temp VC").addChannelTypes(ChannelType.GuildVoice).setRequired(true))
      .addChannelOption((opt) => opt.setName("category").setDescription("The category where temp VCs will be created").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addBooleanOption((opt) => opt.setName("sequential-names").setDescription("Use sequential names (e.g., 'Temp VC #1', 'Temp VC #2')").setRequired(false))
      .addStringOption((opt) => opt.setName("channel-name").setDescription("Base name for sequential channels (default: 'Temp VC')").setMinLength(1).setMaxLength(50).setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Remove a temp VC creator channel")
      .addChannelOption((opt) => opt.setName("channel").setDescription("The temp VC creator channel to remove").addChannelTypes(ChannelType.GuildVoice).setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("delete-all").setDescription("Remove all temp VC creator channels for this server"));

export const config = {
  allowInDMs: false,
  pluginName: "tempvc",
};

export { execute } from "../subcommands/tempvc/index.js";
