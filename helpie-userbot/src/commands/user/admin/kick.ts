/**
 * Kick command - Part of the admin group
 *
 * Location: commands/user/admin/kick.ts
 * Result: /helpie admin kick user:@someone
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a user from the support system")
  .addUserOption((option) => option.setName("user").setDescription("The user to kick").setRequired(true));

export const options = {
  devOnly: true, // Owner only
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  const user = interaction.options.getUser("user", true);

  await interaction.reply({
    content: `👢 **Kicked ${user.tag}**\n\n\nTHIS IS A TEST AND DOES NOTHING YET`,
    ephemeral: true,
  });
}
