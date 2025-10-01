/**
 * Ban command - Part of the admin group
 *
 * Location: commands/user/admin/ban.ts
 * Result: /helpie admin ban user:@someone reason:"spam"
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a user from the support system")
  .addUserOption((option) => option.setName("user").setDescription("The user to ban").setRequired(true))
  .addStringOption((option) => option.setName("reason").setDescription("Reason for the ban").setRequired(false).setMaxLength(500));

export const options = {
  devOnly: true, // Owner only
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "No reason provided";

  await interaction.reply({
    content: `🔨 **Banned ${user.tag}**\n**Reason:** ${reason}\n\n\nTHIS IS A TEST AND DOES NOTHING YET`,
    ephemeral: true,
  });
}
