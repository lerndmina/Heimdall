/**
 * /tag command — Create, use, edit, delete, and list guild tags
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("tag")
  .setDescription("Create and use custom text tags")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((sub) =>
    sub
      .setName("use")
      .setDescription("Send a tag")
      .addStringOption((opt) => opt.setName("name").setDescription("The tag to send").setRequired(true).setAutocomplete(true))
      .addUserOption((opt) => opt.setName("user").setDescription("User to mention with the tag").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Create a new tag")
      .addStringOption((opt) => opt.setName("name").setDescription("Tag name (letters, numbers, hyphens, underscores)").setRequired(true).setMaxLength(32))
      .addStringOption((opt) => opt.setName("content").setDescription("Tag content (up to 2000 characters)").setRequired(true).setMaxLength(2000)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("Edit an existing tag")
      .addStringOption((opt) => opt.setName("name").setDescription("The tag to edit").setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName("content").setDescription("New tag content").setRequired(true).setMaxLength(2000)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a tag")
      .addStringOption((opt) => opt.setName("name").setDescription("The tag to delete").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("List all tags in this server"));

export const config = {
  allowInDMs: false,
};

// Execution handled by subcommands/tag/index.ts
// Autocomplete handled by _autocomplete.ts
export { autocomplete } from "./_autocomplete.js";
