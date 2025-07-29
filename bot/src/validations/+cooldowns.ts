import {
  userCooldownKey,
  guildCooldownKey,
  redisClient,
  COOLDOWN_PREFIX,
  globalCooldownKey,
} from "../Bot";
import BasicEmbed from "../utils/BasicEmbed";
import { RepliableInteraction } from "discord.js";
import { ValidationContext, ValidationResult } from "../../../command-handler/dist/types";
import { debugMsg, getDiscordDate, TimeType } from "../utils/TinyUtils";
import FetchEnvs from "../utils/FetchEnvs";

const env = FetchEnvs();

/**
 * Universal cooldown validation that runs before all commands
 * Checks for global, guild, and user cooldowns
 */
export default async function cooldownValidation({
  interaction,
  command,
  handler,
}: ValidationContext): Promise<ValidationResult> {
  if (!interaction.isRepliable()) {
    return { proceed: true };
  }

  // Check for cooldown bypass
  if (await hasCooldownBypass(interaction)) {
    return { proceed: true };
  }

  const commandName = command?.name || "unknown";

  // Check global cooldown
  const globalCooldown = await getCooldown(globalCooldownKey(commandName));
  if (globalCooldown > 0) {
    await sendCooldownMessage(interaction, commandName, globalCooldown, "global");
    return { proceed: false };
  }

  // Check guild cooldown (if in a guild)
  if (interaction.guildId) {
    const guildCooldown = await getCooldown(guildCooldownKey(interaction.guildId, commandName));
    if (guildCooldown > 0) {
      await sendCooldownMessage(interaction, commandName, guildCooldown, "guild");
      return { proceed: false };
    }
  }

  // Check user cooldown
  const userCooldown = await getCooldown(userCooldownKey(interaction.user.id, commandName));
  if (userCooldown > 0) {
    await sendCooldownMessage(interaction, commandName, userCooldown, "user");
    return { proceed: false };
  }

  debugMsg(`No cooldowns found for ${commandName}, continuing...`);
  return { proceed: true };
}

/**
 * @returns Timestamp in seconds when the cooldown will be over.
 */
export async function getCooldown(key: string): Promise<number> {
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
): Promise<void> {
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

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function hasCooldownBypass(interaction: RepliableInteraction): Promise<boolean> {
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
