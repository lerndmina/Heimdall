import type { CommandData, SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import ParseTimeFromMessage from "../../utils/ParseTimeFromMessage";
import BasicEmbed from "../../utils/BasicEmbed";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("gettime")
  .setDescription("Get the timestamp from a message.")
  .setDMPermission(false)
  .addStringOption((option) =>
    option
      .setName("time")
      .setDescription("The time to parse. (e.g. 'in 5 minutes')")
      .setRequired(true)
  );

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);
  // setCommandCooldown(globalCooldownKey(interaction.commandName), 15);

  const message = interaction.options.getString("time");
  if (!message) return interaction.editReply("You sent an invalid interaction!");

  const data = await ParseTimeFromMessage(message);
  if (!data.success) {
    return interaction.editReply({ content: data.message });
  }

  const embed = BasicEmbed(
    client,
    "Parsed Time",
    `You sent \`${message}\`\n I found a string containing time \`${data.message}\`\nI assumed the timezone \`${data.tz}\`\n\nThe parsed time is: \`\`\`<t:${data.seconds}:F>\`\`\`\n This will resolve to <t:${data.seconds}:F>`
  );

  interaction.editReply({ content: "", embeds: [embed] });
}
