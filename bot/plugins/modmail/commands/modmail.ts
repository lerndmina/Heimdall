/**
 * /modmail command - Modmail system management
 *
 * Subcommands:
 * - config - Interactive configuration panel (setup, categories, send contact button)
 * - open - Open thread for user
 * - close - Close current thread
 * - resolve - Mark thread resolved
 * - ban - Ban user from modmail
 * - unban - Unban user
 * - toggle-autoclose - Toggle auto-close for current thread
 * - migrate - Import modmail data from old Heimdall database
 */

import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("modmail")
  .setDescription("Modmail system management")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  // Config subcommand (launches interactive panel — also handles first-time setup)
  .addSubcommand((sub) => sub.setName("config").setDescription("Open the interactive configuration panel"))
  // Staff actions
  .addSubcommand((sub) =>
    sub
      .setName("open")
      .setDescription("Open a modmail thread for a user")
      .addUserOption((opt) => opt.setName("user").setDescription("User to open thread for").setRequired(true))
      .addStringOption((opt) => opt.setName("reason").setDescription("Reason for opening").setMaxLength(1024))
      .addStringOption((opt) => opt.setName("category").setDescription("Category to use").setAutocomplete(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("close")
      .setDescription("Close the current modmail thread")
      .addStringOption((opt) => opt.setName("reason").setDescription("Close reason").setMaxLength(1024)),
  )
  .addSubcommand((sub) => sub.setName("resolve").setDescription("Mark current thread as resolved"))
  .addSubcommand((sub) =>
    sub
      .setName("ban")
      .setDescription("Ban a user from modmail")
      .addUserOption((opt) => opt.setName("user").setDescription("User to ban").setRequired(true))
      .addStringOption((opt) => opt.setName("reason").setDescription("Ban reason").setRequired(true).setMaxLength(512))
      .addStringOption((opt) => opt.setName("duration").setDescription("Ban duration (e.g., 1d, 7d, 30d)"))
      .addBooleanOption((opt) => opt.setName("permanent").setDescription("Make ban permanent")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("unban")
      .setDescription("Unban a user from modmail")
      .addUserOption((opt) => opt.setName("user").setDescription("User to unban").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("toggle-autoclose").setDescription("Toggle auto-close for the current thread"))
  .addSubcommand((sub) =>
    sub
      .setName("migrate")
      .setDescription("Import modmail data from an old Heimdall database")
      .addStringOption((opt) => opt.setName("database").setDescription("Name of the old Heimdall MongoDB database").setRequired(true))
      .addStringOption((opt) => opt.setName("collection").setDescription("Modmail tickets collection name (default: modmails)")),
  );

export const config = {
  allowInDMs: false,
  pluginName: "modmail",
};

export { execute } from "../subcommands/modmail/index.js";
export { autocomplete } from "./_autocomplete.js";
