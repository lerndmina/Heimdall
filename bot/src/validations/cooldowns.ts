import {
  userCooldownKey,
  guildCooldownKey,
  redisClient,
  COOLDOWN_PREFIX,
  globalCooldownKey,
} from "../Bot";
import BasicEmbed from "../utils/BasicEmbed";
import { get } from "http";
import { BaseInteraction, RepliableInteraction } from "discord.js";
import { ValidationProps } from "commandkit";
import { debugMsg, getDiscordDate, sendDM, TimeType } from "../utils/TinyUtils";
import FetchEnvs from "../utils/FetchEnvs";
const env = FetchEnvs();

export default async function ({ interaction, commandObj, handler }: ValidationProps) {
  if (!interaction.isRepliable()) return;
  if ((await hasCooldownBypass(interaction)) === true) return false;

  const name = commandObj.data.name;

  const globalCooldown = await getCooldown(globalCooldownKey(name));
  if (globalCooldown > 0) return sendCooldownMessage(interaction, name, globalCooldown, "global");

  if (interaction.guildId) {
    const guildCooldown = await getCooldown(guildCooldownKey(interaction.guildId, name));
    if (guildCooldown > 0) return sendCooldownMessage(interaction, name, guildCooldown, "guild");
  }

  const userCooldown = await getCooldown(userCooldownKey(interaction.user.id, name));
  if (userCooldown > 0) return sendCooldownMessage(interaction, name, userCooldown, "user");

  debugMsg(`No cooldowns found for ${name}, continuing...`);
  return false; // Do not stop the command
}

/**
 * @returns Timestamp in seconds when the cooldown will be over.
 */
export async function getCooldown(key: string) {
  const cooldownData = await redisClient.get(key);
  if (cooldownData == null) return 0;
  const cooldown = Number.parseInt(cooldownData);
  return Math.floor(cooldown / 1000);
}

export async function sendCooldownMessage(
  interaction: RepliableInteraction,
  commandName: string,
  cooldownLeft: number,
  cooldownType: "global" | "guild" | "user"
) {
  if (cooldownLeft <= 0) return;
  const embed = BasicEmbed(
    interaction.client,
    "Cooldown",
    `The command \`/${commandName}\` is in ${cooldownType} cooldown it will be available ${getDiscordDate(
      cooldownLeft,
      TimeType.RELATIVE
    )} Please try again once the cooldown is over.`,
    undefined,
    "Red"
  );

  interaction.reply({ embeds: [embed], ephemeral: true });

  return true;
}

export async function hasCooldownBypass(interaction: RepliableInteraction) {
  if (env.OWNER_IDS.includes(interaction.user.id)) {
    const key = `bypasscooldowns:${interaction.user.id}`;
    const res = await redisClient.get(key);
    if (res === "true") {
      debugMsg(`Bypassing cooldown for ${interaction.user.id}... Key = ${key} - Value = ${res}`);
      return true;
    }
  }
  return false;
}
