import type { CommandData, SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import { sleep } from "../../utils/TinyUtils";
import BasicEmbed from "../../utils/BasicEmbed";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Replies with Pong!")
  .addBooleanOption((option) =>
    option.setName("private").setDescription("Whether to reply privately or not").setRequired(false)
  );

export const options: CommandOptions = {
  devOnly: false,
  guildOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  setCommandCooldown(globalCooldownKey(interaction.commandName), 15);

  var isPrivate = interaction.options.getBoolean("private") || false;
  await initialReply(interaction, isPrivate);

  if (isPrivate == null) isPrivate = true;

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
