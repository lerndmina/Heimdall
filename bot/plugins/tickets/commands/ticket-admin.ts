/**
 * /ticket-admin command - Admin ticket system configuration
 */

import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-admin")
  .setDescription("Manage ticket system configuration")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommandGroup((group) =>
    group
      .setName("category")
      .setDescription("Manage ticket categories")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a new ticket category")
          .addStringOption((opt) => opt.setName("name").setDescription("Category name").setRequired(true).setMaxLength(100))
          .addStringOption((opt) =>
            opt
              .setName("type")
              .setDescription("Category type")
              .setRequired(true)
              .addChoices({ name: "Parent (contains child categories)", value: "parent" }, { name: "Child (actual ticket category)", value: "child" }),
          )
          .addStringOption((opt) => opt.setName("description").setDescription("Category description").setRequired(true).setMaxLength(1024))
          .addChannelOption((opt) => opt.setName("discord_category").setDescription("Discord category channel (required for child categories)").setRequired(false))
          .addStringOption((opt) => opt.setName("parent").setDescription("Parent category ID (required for child categories)").setRequired(false).setAutocomplete(true))
          .addStringOption((opt) => opt.setName("emoji").setDescription("Category emoji").setRequired(false))
          .addStringOption((opt) => opt.setName("ticket_name_format").setDescription("Ticket naming format (tokens: {number}, {openerusername}, {claimant}, {categoryname})").setRequired(false)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("List all ticket categories")
          .addStringOption((opt) =>
            opt.setName("type").setDescription("Filter by category type").setRequired(false).addChoices({ name: "Parent", value: "parent" }, { name: "Child", value: "child" }),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("Edit a ticket category")
          .addStringOption((opt) => opt.setName("category").setDescription("Category to edit").setRequired(true).setAutocomplete(true))
          .addStringOption((opt) => opt.setName("name").setDescription("New category name").setRequired(false).setMaxLength(100))
          .addStringOption((opt) => opt.setName("description").setDescription("New category description").setRequired(false).setMaxLength(1024))
          .addStringOption((opt) => opt.setName("emoji").setDescription("New category emoji").setRequired(false))
          .addStringOption((opt) => opt.setName("ticket_name_format").setDescription("New ticket naming format").setRequired(false))
          .addBooleanOption((opt) => opt.setName("active").setDescription("Set category active/inactive").setRequired(false)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a ticket category")
          .addStringOption((opt) => opt.setName("category").setDescription("Category to delete").setRequired(true).setAutocomplete(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("questions")
          .setDescription("Manage category questions")
          .addStringOption((opt) => opt.setName("category").setDescription("Category to manage questions for").setRequired(true).setAutocomplete(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("preview")
          .setDescription("Preview the question flow for a category")
          .addStringOption((opt) => opt.setName("category").setDescription("Category to preview questions for").setRequired(true).setAutocomplete(true)),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("opener")
      .setDescription("Manage ticket openers")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a new ticket opener")
          .addStringOption((opt) => opt.setName("name").setDescription("Opener name (internal)").setRequired(true).setMaxLength(100))
          .addStringOption((opt) =>
            opt
              .setName("ui_type")
              .setDescription("UI type for category selection")
              .setRequired(true)
              .addChoices({ name: "Buttons (max 25 buttons in grid)", value: "buttons" }, { name: "Dropdown (max 25 options)", value: "dropdown" }),
          )
          .addStringOption((opt) => opt.setName("title").setDescription("Embed title").setRequired(true).setMaxLength(256))
          .addStringOption((opt) => opt.setName("description").setDescription("Embed description").setRequired(true).setMaxLength(4096)),
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List all ticket openers"))
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("Edit a ticket opener")
          .addStringOption((opt) => opt.setName("opener").setDescription("Opener to edit").setRequired(true).setAutocomplete(true))
          .addStringOption((opt) => opt.setName("title").setDescription("New embed title").setRequired(false).setMaxLength(256))
          .addStringOption((opt) => opt.setName("description").setDescription("New embed description").setRequired(false).setMaxLength(4096))
          .addStringOption((opt) => opt.setName("color").setDescription("Embed color (hex, e.g., #5865F2)").setRequired(false))
          .addStringOption((opt) => opt.setName("category").setDescription("Add a category to this opener").setRequired(false).setAutocomplete(true))
          .addStringOption((opt) => opt.setName("remove_category").setDescription("Remove a category from this opener").setRequired(false).setAutocomplete(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("post")
          .setDescription("Post or update an opener message")
          .addStringOption((opt) => opt.setName("opener").setDescription("Opener to post").setRequired(true).setAutocomplete(true))
          .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to post in").setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a ticket opener")
          .addStringOption((opt) => opt.setName("opener").setDescription("Opener to delete").setRequired(true).setAutocomplete(true)),
      ),
  );

export const config = {
  allowInDMs: false,
  pluginName: "tickets",
};

export { execute } from "../subcommands/ticket-admin/index.js";
export { autocomplete } from "./_autocomplete.js";
