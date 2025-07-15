import type { SlashCommandProps, CommandOptions } from "commandkit";
import { ChannelType, SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, userCooldownKey, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import { initialReply } from "../../utils/initialReply";
import Database from "../../utils/data/database";
import SuggestionConfigModel, { SuggestionConfigType } from "../../models/SuggestionConfig";

export const data = new SlashCommandBuilder()
  .setName("suggestion-config")
  .setDescription("Configure the suggestion system")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set")
      .setDescription("Set the suggestion channel for this guild")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to send suggestions to")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("remove").setDescription("Remove the suggestion channel for this guild")
  )
  .setDMPermission(false);

const db = new Database();

export const options: CommandOptions = {
  devOnly: true,
  deleted: false,
  userPermissions: ["ManageGuild"],
  botPermissions: ["SendMessages", "EmbedLinks"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);

  const channel = interaction.options.getChannel("channel", false);
  const subcommand = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;

  if (!channel || channel.type !== ChannelType.GuildText || !subcommand || !guildId) {
    return interaction.editReply({
      content: "Invalid channel or missing subcommand",
    });
  }

  if (subcommand === "set") {
    await db.findOneAndUpdate(
      SuggestionConfigModel,
      { guildId },
      { channelId: channel.id, guildId },
      { upsert: true, new: true }
    );
  } else if (subcommand === "remove") {
    await db.findOneAndDelete(SuggestionConfigModel, { guildId });
  } else {
    return interaction.editReply({
      content: "Invalid subcommand",
    });
  }

  interaction.editReply({
    content: `Suggestion channel ${subcommand === "set" ? "set" : "removed"} successfully!`,
  });
}
