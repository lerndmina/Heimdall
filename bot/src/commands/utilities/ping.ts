import type { CommandData, SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import { sleep } from "../../utils/TinyUtils";
import BasicEmbed from "../../utils/BasicEmbed";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Check the bot's latency and websocket ping.")
  .addBooleanOption((option) =>
    option.setName("public").setDescription("Whether to reply publicly or not").setRequired(false)
  )
  .setDMPermission(true); // Allow in DMs

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  setCommandCooldown(globalCooldownKey(interaction.commandName), 15);

  var publicReply = interaction.options.getBoolean("public") == true;
  await initialReply(interaction, !publicReply);

  const timestamp = interaction.createdTimestamp;
  const currentTime = Date.now();
  var latency = timestamp - currentTime < 0 ? currentTime - timestamp : timestamp - currentTime;
  const latencyString = latency.toString() + "ms";

  var wsPing = interaction.client.ws.ping;

  const fields = [
    { name: "Websocket", value: `${wsPing}ms`, inline: false },
    { name: "Message Latency", value: `${latencyString}`, inline: false },
  ];

  let needsRefresh = false;
  if (wsPing < 5 || latency < 5) {
    fields[0].value = `${waitingEmoji}`;
    needsRefresh = true;
  }

  const embedTitle = "🏓 Pong!";
  const embedDescription = `Bot online! Results Below.`;

  await interaction.editReply({
    content: "",
    embeds: [BasicEmbed(client, embedTitle, embedDescription, fields)],
  });

  if (needsRefresh) {
    await sleep(15 * 1000);
    fields[0].value = `${interaction.client.ws.ping}ms`;
    try {
      await interaction.editReply({
        content: "",
        embeds: [BasicEmbed(client, embedTitle, embedDescription, fields)],
      });
    } catch (error) {
      null;
    }
  }
}
