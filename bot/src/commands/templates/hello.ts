import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("hello")
  .setDescription("This is a template command.");

export const options: LegacyCommandOptions = {
  devOnly: true,
  deleted: false,
  userPermissions: [],
  botPermissions: ["ManageMessages", "EmbedLinks"],
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  await initialReply(interaction, true);
  setCommandCooldown(globalCooldownKey(interaction.commandName), 600);

  interaction.editReply({ content: "Loading spinner complete" });
}
