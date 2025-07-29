import type { LegacyCommandData, LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { globalCooldownKey, redisClient, setCommandCooldown, waitingEmoji } from "../../Bot";
import ParseTimeFromMessage from "../../utils/ParseTimeFromMessage";
import BasicEmbed from "../../utils/BasicEmbed";
import { debugMsg } from "../../utils/TinyUtils";
import prettyMilliseconds from "pretty-ms";

export const data = new SlashCommandBuilder()
  .setName("uptime")
  .setDescription("Get the uptime of the bot.")
  .setDMPermission(false);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  const lastRestart = parseInt((await redisClient.get(`${client.user.id}-lastRestart`)) ?? "0");
  const now = Date.now();
  const uptime = prettyMilliseconds(now - lastRestart, {
    verbose: true,
    unitCount: 2,
    secondsDecimalDigits: 0,
    millisecondsDecimalDigits: 0,
    separateMilliseconds: true,
  });

  return interaction.reply({
    embeds: [BasicEmbed(client, "Uptime", `I was last restarted ${uptime} ago.`)],
  });
}
