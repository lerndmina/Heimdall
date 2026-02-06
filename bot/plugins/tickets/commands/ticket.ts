/**
 * /ticket command - User and staff ticket operations
 */

import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Manage support tickets")
  .addSubcommand((sub) =>
    sub
      .setName("open")
      .setDescription("Open a ticket for a user (staff only)")
      .addUserOption((opt) => opt.setName("user").setDescription("User to open ticket for").setRequired(true))
      .addStringOption((opt) => opt.setName("category").setDescription("Ticket category").setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName("reason").setDescription("Reason for opening ticket").setRequired(false).setMaxLength(500)),
  )
  .addSubcommand((sub) => sub.setName("close").setDescription("Close the current ticket"))
  .addSubcommand((sub) => sub.setName("claim").setDescription("Claim the current ticket"))
  .addSubcommand((sub) => sub.setName("unclaim").setDescription("Unclaim the current ticket"))
  .addSubcommand((sub) =>
    sub
      .setName("rename")
      .setDescription("Rename the current ticket channel")
      .addStringOption((opt) => opt.setName("name").setDescription("New channel name").setRequired(true).setMinLength(1).setMaxLength(100)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("move")
      .setDescription("Move ticket to a different category")
      .addStringOption((opt) => opt.setName("category").setDescription("New ticket category").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List tickets")
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("Filter by status")
          .setRequired(false)
          .addChoices({ name: "Open", value: "open" }, { name: "Claimed", value: "claimed" }, { name: "Closed", value: "closed" }, { name: "Archived", value: "archived" }),
      )
      .addStringOption((opt) => opt.setName("category").setDescription("Filter by category").setRequired(false).setAutocomplete(true))
      .addUserOption((opt) => opt.setName("user").setDescription("Filter by user").setRequired(false)),
  )
  .addSubcommand((sub) => sub.setName("keepopen").setDescription("Toggle inactivity reminder exemption (staff only)"));

export const config = {
  allowInDMs: false,
  pluginName: "tickets",
};

export { execute } from "../subcommands/ticket/index.js";
export { autocomplete } from "./_autocomplete.js";
