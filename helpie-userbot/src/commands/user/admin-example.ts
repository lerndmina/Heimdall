/**
 * Example: Subcommand Groups
 *
 * This shows how to create grouped subcommands like:
 * /helpie admin ban
 * /helpie admin kick
 * /helpie admin mute
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("Admin commands")
  .addSubcommandGroup((group) =>
    group
      .setName("moderation")
      .setDescription("Moderation commands")
      .addSubcommand((sub) =>
        sub
          .setName("ban")
          .setDescription("Ban a user")
          .addUserOption((opt) => opt.setName("user").setDescription("User to ban").setRequired(true))
          .addStringOption((opt) => opt.setName("reason").setDescription("Reason for ban").setRequired(false))
      )
      .addSubcommand((sub) =>
        sub
          .setName("kick")
          .setDescription("Kick a user")
          .addUserOption((opt) => opt.setName("user").setDescription("User to kick").setRequired(true))
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName("settings")
      .setDescription("Admin settings")
      .addSubcommand((sub) => sub.setName("view").setDescription("View current settings"))
      .addSubcommand((sub) =>
        sub
          .setName("update")
          .setDescription("Update settings")
          .addStringOption((opt) => opt.setName("key").setDescription("Setting key").setRequired(true))
          .addStringOption((opt) => opt.setName("value").setDescription("Setting value").setRequired(true))
      )
  );

export const options = {
  devOnly: true, // Owner only
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Get the subcommand group and subcommand
  const group = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  // Route based on group + subcommand
  if (group === "moderation") {
    if (subcommand === "ban") {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "No reason provided";

      await interaction.reply({
        content: `🔨 Banned ${user.tag}\nReason: ${reason}`,
        ephemeral: true,
      });
    } else if (subcommand === "kick") {
      const user = interaction.options.getUser("user", true);

      await interaction.reply({
        content: `👢 Kicked ${user.tag}`,
        ephemeral: true,
      });
    }
  } else if (group === "settings") {
    if (subcommand === "view") {
      await interaction.reply({
        content: "⚙️ Current settings:\n- Setting 1: Value\n- Setting 2: Value",
        ephemeral: true,
      });
    } else if (subcommand === "update") {
      const key = interaction.options.getString("key", true);
      const value = interaction.options.getString("value", true);

      await interaction.reply({
        content: `✅ Updated ${key} = ${value}`,
        ephemeral: true,
      });
    }
  }
}
