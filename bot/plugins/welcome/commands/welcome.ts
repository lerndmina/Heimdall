/**
 * /welcome command — Setup and manage welcome messages
 */

import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Setup and manage welcome messages for new members")
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Set up the welcome message for this server")
      .addChannelOption((opt) => opt.setName("channel").setDescription("The channel to send welcome messages in").addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((opt) => opt.setName("message").setDescription("The welcome message (use /welcome variables to see options)").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("remove").setDescription("Remove the welcome message configuration"))
  .addSubcommand((sub) => sub.setName("view").setDescription("View the current welcome message settings"))
  .addSubcommand((sub) =>
    sub
      .setName("test")
      .setDescription("Test the welcome message in the configured channel")
      .addStringOption((opt) => opt.setName("message").setDescription("A custom message to test (leave empty to test current config)").setRequired(false)),
  )
  .addSubcommand((sub) => sub.setName("variables").setDescription("View available template variables for welcome messages"));

export const config = {
  allowInDMs: false,
};

// Execution is handled by subcommands/welcome/index.ts (auto-discovered)
