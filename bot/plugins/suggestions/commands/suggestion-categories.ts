import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("suggestion-categories")
  .setDescription("Manage suggestion categories")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) => sub.setName("list").setDescription("List all suggestion categories"))
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a new suggestion category")
      .addStringOption((opt) => opt.setName("name").setDescription("Category name").setRequired(true).setMaxLength(50))
      .addStringOption((opt) => opt.setName("description").setDescription("Category description").setRequired(true).setMaxLength(200))
      .addStringOption((opt) => opt.setName("emoji").setDescription("Category emoji").setRequired(false))
      .addChannelOption((opt) => opt.setName("channel").setDescription("Restrict category to specific suggestion channel (optional)").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a suggestion category")
      .addStringOption((opt) => opt.setName("category").setDescription("Category to remove").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("Edit a suggestion category")
      .addStringOption((opt) => opt.setName("category").setDescription("Category to edit").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("toggle")
      .setDescription("Enable or disable the categories feature")
      .addBooleanOption((opt) => opt.setName("enabled").setDescription("Whether categories should be enabled").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("reorder").setDescription("Reorder suggestion categories"));

export const config = {
  allowInDMs: false,
};

export { autocomplete } from "./_autocomplete.js";
