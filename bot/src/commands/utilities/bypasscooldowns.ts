import type { CommandData, SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { globalCooldownKey, redisClient, setCommandCooldown, waitingEmoji } from "../../Bot";
import ms from "ms";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";
import { initialReply } from "../../utils/initialReply";

const env = FetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("bypasscooldowns")
  .setDescription("Admin only command to bypass all command cooldowns for a set amount of time.")
  .setDMPermission(false)
  .addStringOption((option) =>
    option
      .setName("time")
      .setDescription("The amount of time to bypass the cooldowns for")
      .setRequired(true)
  );

export const options: CommandOptions = {
  devOnly: false,
  guildOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);

  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return interaction.editReply("I'm sorry dave, I'm afraid I can't do that.");
  }

  var time = interaction.options.getString("time")!;
  var timeInSeconds = 0;

  const key = "bypasscooldowns:" + interaction.user.id;

  try {
    timeInSeconds = ms(time) / 1000;
    if (timeInSeconds < 0) {
      return interaction.editReply("Time cannot be negative.");
    }

    const ONE_WEEK = 60 * 60 * 24 * 7;
    if (timeInSeconds > ONE_WEEK) {
      return interaction.editReply("Time cannot be greater than 1 week.");
    }

    await redisClient.set(key, "true");
    await redisClient.expire(key, timeInSeconds);
  } catch (err: any) {
    const e = err.toString() || "Unknown error";
    log.error(err);

    try {
      await redisClient.del(key);
    } catch (error) {
      log.error(`Unexpected error: ${error}`);
    }

    return interaction.editReply(
      `Error parsing time: \`\`\`log\n${e}\`\`\` - Please use a valid time format.\n\nExample: \`5m\`, \`5h\`, \`5d\`, or \`5 minutes\`, \`5 hours\`, \`5 days\` or any other format that makes sense.`
    );
  }

  interaction.editReply(`Bypassing all command cooldowns for ${time}...`);
}
