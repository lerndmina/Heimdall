import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { SlashCommandBuilder } from "discord.js";
import { setCommandCooldown, userCooldownKey, waitingEmoji } from "../../Bot";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("therules")
  .setDescription("Tell someone to read the rules.")
  .setDMPermission(false);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  await initialReply(interaction, false);
  setCommandCooldown(userCooldownKey(interaction.user.id, interaction.commandName), 30);

  interaction.editReply("https://therules.fyi/");
}
