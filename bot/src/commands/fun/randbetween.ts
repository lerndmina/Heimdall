import type { SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import BasicEmbed from "../../utils/BasicEmbed";

export const data = new SlashCommandBuilder()
  .setName("randbetween")
  .setDescription("Generate a random number between two numbers.")
  .addIntegerOption((option) =>
    option.setName("min").setDescription("The minimum number.").setRequired(true)
  )
  .addIntegerOption((option) =>
    option.setName("max").setDescription("The maximum number.").setRequired(true)
  )
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const min = interaction.options.getInteger("min", true);
  const max = interaction.options.getInteger("max", true);

  if (min > max) {
    interaction.reply({
      content: "The minimum number cannot be greater than the maximum number.",
      ephemeral: true,
    });
    return;
  }

  const random = Math.floor(Math.random() * (max - min + 1)) + min;

  interaction.reply({
    content: ``,
    embeds: [BasicEmbed(client, "Random Number", `Your random number is: **${random}**`)],
  });
}
