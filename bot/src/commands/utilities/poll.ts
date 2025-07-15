import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  SlashCommandIntegerOption,
  SlashCommandStringOption,
  MessageComponentInteraction,
  BaseInteraction,
  Message,
  StringSelectMenuInteraction,
  CacheType,
  Snowflake,
  InteractionResponse,
  APIEmbed,
  EmbedBuilder,
  Client,
  DiscordAPIError,
  SlashCommandRoleOption,
} from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import { ThingGetter, debugMsg, sleep } from "../../utils/TinyUtils";
import { CommandOptions, SlashCommandProps } from "commandkit";
import ms from "ms";
import Database from "../../utils/data/database";
import PollsSchema, { PollsType } from "../../models/PollsSchema";
import { generatePollMessage } from "../../events/interactionCreate/poll-interaction";
import { waitForPollEnd } from "../../events/ready/checkpolls";
import { channel } from "diagnostics_channel";
import log from "../../utils/log";

export const data = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Create a poll for people to vote on.")
  .setDMPermission(false)
  .addStringOption((option: SlashCommandStringOption) =>
    option
      .setName("question")
      .setDescription("The poll question")
      .setRequired(true)
      .setMaxLength(100)
  )
  .addStringOption((option: SlashCommandStringOption) =>
    option
      .setName("options")
      .setDescription("The poll content: vote1;vote2;etc")
      .setRequired(true)
      .setMaxLength(100)
  )
  .addStringOption((option: SlashCommandStringOption) =>
    option
      .setName("time")
      .setDescription("The time for the poll to last. (1m, 1h, 1d, 1w, 1mo etc.)")
      .setRequired(true)
  )
  .addStringOption((option: SlashCommandStringOption) =>
    option
      .setName("description")
      .setDescription("Optional description for the poll")
      .setRequired(false)
  )
  .addRoleOption((option: SlashCommandRoleOption) =>
    option
      .setName("mention-role")
      .setDescription("The role to mention in the poll message")
      .setRequired(false)
  );

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const question = interaction.options.getString("question")!;
  const options = interaction.options.getString("options")!.replace(/;+$/, "").split(";");
  const timeString = interaction.options.getString("time");
  const description = interaction.options.getString("description");
  const mentionRole = interaction.options.getRole("mention-role");

  if (!question || !options || !timeString) {
    return interaction.reply({
      content: "You need to provide a question, options and a time for the poll to last.",
      ephemeral: true,
    });
  }
  if (!interaction.channel)
    return interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });

  const timeStringArr = timeString!.split(" ");

  var time = 0;

  for (const timeStr of timeStringArr) {
    time += ms(timeStr);

    debugMsg(`Adding ${timeStr} to time. Total: ${time}`);
  }

  time = Math.round(time / 1000);

  console.log(`TimeString: ${timeString} translated to ${time} seconds`);

  if (time > 2592000) {
    await interaction.reply({
      content: "",
      embeds: [BasicEmbed(client, "Poll Time Limit", "The maximum time limit is 30 days.")],
      ephemeral: true,
    });
    return;
  }

  // check if the content is valid
  if (options.length < 2 || options.length > 25) {
    await interaction.reply({
      content: "You need at least 2 options to create a poll. Max 25 options.",
      ephemeral: true,
    });
    return;
  }

  // Create a unique interaction ID for this poll
  const pollId = `poll-${interaction.user.id}-${Date.now()}`;

  const POLL_TIME = time * 1000;

  const endTime = Date.now() + POLL_TIME;
  const endTimeSeconds = Math.floor(endTime / 1000);
  const dbOptions = options.map((option) => ({ name: option, votes: 0 }));
  const embedDescriptionArray = [
    `Poll will end <t:${endTimeSeconds}:R>`,
    `Total Votes - 0`,
    description ? `\n${description}` : "",
    `\n${options
      .map((option, index) => {
        const progressBar = "░".repeat(10); // Empty progress bar initially
        return `${index + 1}. \`${option}\` ${progressBar} 0 (0%)`;
      })
      .join("\n")}`,
    "\n **You can change your vote every 60 seconds**.",
  ];
  // Create a temporary poll object for the initial embed generation
  const tempPoll = {
    question,
    options: dbOptions,
    voterDetails: [],
    embedDescriptionArray,
    pollId: "temp",
    messageId: "temp",
    channelId: interaction.channel.id,
    creatorId: interaction.user.id,
    endsAt: new Date(endTime),
  } as unknown as PollsType;

  const embed = generatePollMessage(tempPoll, client);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(pollId)
    .setPlaceholder("Select an option")
    .setMinValues(1)
    .setMaxValues(1);

  options.forEach((option, index) => {
    selectMenu.addOptions({
      label: option,
      value: index.toString(),
    });
  });

  const END_OPTION = options.length;

  selectMenu.addOptions({
    label: "End Poll",
    value: END_OPTION.toString(),
  });

  const row = new ActionRowBuilder().addComponents(selectMenu);

  let response: Message;
  log.info(`Mention Role: ${mentionRole}`);
  try {
    if (!interaction.channel || !("send" in interaction.channel)) {
      interaction.reply({
        content: "Unable to send poll message in this channel type.",
        ephemeral: true,
      });
      return;
    }
    response = await interaction.channel.send({
      content: mentionRole ? `${mentionRole}` : "",
      embeds: [embed],
      components: [row as any],
    });
  } catch (error: any) {
    if (error instanceof DiscordAPIError) {
      if (error.code === 50001) {
        interaction.reply({
          content: "Unable to send poll message, missing permissions.",
          ephemeral: true,
        });
        return;
      }
    }
    interaction.reply({ content: "Failed to create poll!", ephemeral: true });
    debugMsg(error);
    return;
  }

  interaction.reply({ content: "Poll created!", ephemeral: true });

  // Add the poll to the DB
  const poll = {
    pollId,
    messageId: response.id,
    channelId: interaction.channel.id,
    creatorId: interaction.user.id,
    endsAt: new Date(endTime),
    options: dbOptions,
    question,
    embedDescriptionArray,
    mentionRole: mentionRole ? mentionRole.id : undefined,
    voterDetails: [],
  };

  const db = new Database();
  await db.findOneAndUpdate(PollsSchema, { pollId }, poll);

  const getter = new ThingGetter(client);

  waitForPollEnd(poll as unknown as PollsType, db, client, getter);
  return;
}
