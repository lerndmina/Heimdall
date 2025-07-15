import { SlashCommandBuilder } from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import { CommandOptions, CommandProps, SlashCommandProps } from "commandkit";

export const data = new SlashCommandBuilder()
  .setName("emojify")
  .setDescription("Convert text to emojis")
  .setDMPermission(false)
  .addStringOption((option) =>
    option.setName("text").setDescription("The text to convert").setRequired(true)
  );

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const text = interaction.options.getString("text")?.toLocaleLowerCase()!; // Won't be null because it's required

  const emojified = text
    .split("")
    .map((letter) => {
      if (letter === " ") return ":heavy_minus_sign:";
      else if (/[a-zA-Z]/.test(letter)) return `:regional_indicator_${letter}:`;
      else return letter;
    })
    .join("");

  if (emojified.length > 2000) {
    await interaction.reply({
      embeds: [
        BasicEmbed(
          client,
          "‼️ Error",
          `The emojified text is too long.\n\n\`${emojified.length}\` characters is larger than the limit of \`2000\``,
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const embed = BasicEmbed(client, "Emojified!", `${emojified}`, undefined, "Random");

  interaction.reply({
    embeds: [embed],
    ephemeral: false,
  });
}
