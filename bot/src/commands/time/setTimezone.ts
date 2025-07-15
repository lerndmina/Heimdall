import type { CommandData, SlashCommandProps, CommandOptions, AutocompleteProps } from "commandkit";
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationCommand,
  AutocompleteInteraction,
  EmbedField,
} from "discord.js";
import UserTimezone from "../../models/UserTimezone";
import Database from "../../utils/data/database";
import moment from "moment-timezone";
import { debugMsg, ThingGetter } from "../../utils/TinyUtils";
import { debug } from "console";
import log from "../../utils/log";

export const data = new SlashCommandBuilder()
  .setName("settimezone")
  .setDescription("Sets your timezone in the bot!")
  .addStringOption((option) =>
    option
      .setName("timezone")
      .setDescription("Your timezone")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption((option) =>
    option
      .setName("applynickname")
      .setDescription(
        "Applys your UTC offset to your nickname (optional). You must be in a server to use this."
      )
      .setRequired(false)
  );

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

const TIMEZONE_NAMES = moment.tz.names();

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const timezone = interaction.options.getString("timezone");
  if (!timezone) {
    await interaction.reply({ content: "You need to enter a timezone!", ephemeral: true });
    return;
  }
  if (!TIMEZONE_NAMES.includes(timezone)) {
    await interaction.reply({ content: "You sent an invalid timezone!", ephemeral: true });
    return;
  }

  const user = interaction.user;
  const userId = user.id;

  const db = new Database();
  await db.findOneAndUpdate(UserTimezone, { userId }, { timezone });

  // Convert timezone to UTC offset
  const utcOffset = moment.tz(timezone).utcOffset();
  const offsetHours = Math.floor(utcOffset / 60);
  const offsetString = `UTC${offsetHours >= 0 ? `+${offsetHours}` : `${offsetHours}`}`;
  debugMsg(`User ${userId} set their timezone to ${timezone} (${offsetString})`);

  // Apply nickname
  let applyNickname = false;
  let failedToApply = false;
  applyNickname = interaction.options.getBoolean("applynickname") || false;
  if (applyNickname && interaction.guild) {
    try {
      const getter = new ThingGetter(client);
      const member = await getter.getMember(interaction.guild, userId);
      const currentName = member.nickname || member.displayName;
      const cleanName = currentName.replace(/\s+\|\s+UTC[+-]\d+$/i, "");
      await member.setNickname(`${cleanName} | ${offsetString}`);
      debugMsg(`Updated nickname for ${userId} to "${cleanName} | ${offsetString}"`);
    } catch (error) {
      failedToApply = true;
      debugMsg(`Failed to update nickname for ${userId}`);
      log.error(error);
    }
  }

  const fields: EmbedField[] = [];

  fields.push({ name: "Timezone", value: timezone, inline: true });
  fields.push({ name: "UTC Offset", value: offsetString, inline: true });
  if (applyNickname) {
    if (failedToApply) {
      fields.push({ name: "Nickname Update", value: "Failed to update nickname", inline: true });
    } else {
      fields.push({ name: "Nickname Update", value: "Updated nickname", inline: true });
    }
  }

  const postEmbed = new EmbedBuilder()
    .setTitle("Timezone Set")
    .setDescription(`Your timezone has been set to \`${timezone}\``)
    .addFields(fields)
    .setColor("#0099ff");

  await interaction.reply({ embeds: [postEmbed], ephemeral: true });
}

export async function autocomplete({ interaction, client, handler }: AutocompleteProps) {
  const focusedTzOption = interaction.options.getFocused(true).value.toLowerCase();
  const filteredChoices = TIMEZONE_NAMES.filter((tz) => tz.toLowerCase().includes(focusedTzOption));
  const choices = filteredChoices.map((tz) => ({ name: tz, value: tz }));
  interaction.respond(choices.slice(0, 25));
}
