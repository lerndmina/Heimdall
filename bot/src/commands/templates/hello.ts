import type { SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("hello")
  .setDescription("This is a template command.");

export const options: CommandOptions = {
  devOnly: true,
  deleted: false,
  userPermissions: [],
  botPermissions: ["ManageMessages", "EmbedLinks"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);
  setCommandCooldown(globalCooldownKey(interaction.commandName), 600);

  interaction.editReply({ content: "Loading spinner complete" });
}
