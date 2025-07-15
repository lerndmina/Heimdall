import type { SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder } from "discord.js";
import { setCommandCooldown, userCooldownKey, waitingEmoji } from "../../Bot";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("therules")
  .setDescription("Tell someone to read the rules.")
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, false);
  setCommandCooldown(userCooldownKey(interaction.user.id, interaction.commandName), 30);

  interaction.editReply("https://therules.fyi/");
}
