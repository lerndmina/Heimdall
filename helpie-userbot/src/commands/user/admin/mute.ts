/**
 * Mute command - Part of the admin group
 *
 * Location: commands/user/admin/mute.ts
 * Result: /helpie admin mute user:@someone duration:60
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Temporarily mute a user")
  .addUserOption((option) => option.setName("user").setDescription("The user to mute").setRequired(true))
  .addIntegerOption(
    (option) => option.setName("duration").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(10080) // 1 week max
  );

export const options = {
  devOnly: true,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  const user = interaction.options.getUser("user", true);
  const duration = interaction.options.getInteger("duration", true);

  await interaction.reply({
    content: `🔇 **Muted ${user.tag}** for ${duration} minutes\n\n\nTHIS IS A TEST AND DOES NOTHING YET`,
    ephemeral: true,
  });
}
