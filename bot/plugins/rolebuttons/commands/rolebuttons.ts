import { SlashCommandBuilder, ChannelType } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("rolebuttons")
  .setDescription("Create and manage reusable self-role button panels")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Create a new blank role button panel")
      .addStringOption((opt) => opt.setName("name").setDescription("Panel name").setRequired(true).setMaxLength(64)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("Edit an existing panel")
      .addStringOption((opt) => opt.setName("panel").setDescription("Panel name").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("post")
      .setDescription("Post a panel to a channel")
      .addStringOption((opt) => opt.setName("panel").setDescription("Panel name").setRequired(true).setAutocomplete(true))
      .addChannelOption((opt) => opt.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("update")
      .setDescription("Update all posted messages for a panel")
      .addStringOption((opt) => opt.setName("panel").setDescription("Panel name").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a panel")
      .addStringOption((opt) => opt.setName("panel").setDescription("Panel name").setRequired(true).setAutocomplete(true))
      .addBooleanOption((opt) => opt.setName("delete_posts").setDescription("Delete all posted panel messages too").setRequired(false)),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("List role button panels in this server"));

export const config = {
  allowInDMs: false,
  pluginName: "rolebuttons",
};

export { execute } from "../subcommands/rolebuttons/index.js";
export { autocomplete } from "./_autocomplete.js";
