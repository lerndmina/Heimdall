import type { SlashCommandProps, CommandOptions, CommandKit } from "commandkit";
import { ActivityType, ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import FetchEnvs from "../../utils/FetchEnvs";
import BasicEmbed from "../../utils/BasicEmbed";
import Database from "../../utils/data/database";
import Settings from "../../models/Settings";
import CommandError from "../../utils/interactionErrors/CommandError";
import { ThingGetter } from "../../utils/TinyUtils";
const env = FetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("Change the bot settings.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("avatar")
      .setDescription("Change the bot's avatar.")
      .addAttachmentOption((option) =>
        option.setName("avatar").setDescription("The avatar to set.").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("username")
      .setDescription("Change the bot's username.")
      .addStringOption((option) =>
        option.setName("username").setDescription("The username to set.").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("nickname")
      .setDescription("Change the bot's nickname.")
      .addStringOption((option) =>
        option.setName("nickname").setDescription("The nickname to set.").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set-activity")
      .setDescription("Change the bot's activity.")
      .addStringOption((option) =>
        option.setName("activity").setDescription("The bot's activity type").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("text").setDescription("The text to set.").setRequired(true)
      )
  )
  .setDMPermission(true);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  let hasErrored: any;
  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
  }

  const subcommand = interaction.options.getSubcommand();
  try {
    if (subcommand === "avatar") return changeAvatar(interaction, client, handler);
    if (subcommand === "username") return changeUsername(interaction, client, handler);
    if (subcommand === "nickname") return changeNickname(interaction, client, handler);
    if (subcommand === "set-activity") return changeStatus(interaction, client, handler);

    return interaction.reply({
      content: "Invalid subcommand.",
      ephemeral: true,
    });
  } catch (err) {
    hasErrored = err;
  }

  if (hasErrored) new CommandError(hasErrored, interaction, client).send();
}

async function changeAvatar(
  interaction: ChatInputCommandInteraction,
  client: Client<true>,
  handler: CommandKit
) {
  const avatar = interaction.options.getAttachment("avatar");
  if (!avatar) return interaction.reply({ content: "Please provide an avatar.", ephemeral: true });

  try {
    await client.user.setAvatar(avatar.url);
  } catch (error) {
    return interaction.reply({
      content: `An error occurred while changing the avatar: \`\`\`${error}\`\`\``,
      ephemeral: true,
    });
  }

  return interaction.reply({
    embeds: [
      BasicEmbed(
        client,
        "Avatar Changed",
        `The bot's avatar has been changed. This may take a few minutes to update.`
      ),
    ],
  });
}

async function changeUsername(
  interaction: ChatInputCommandInteraction,
  client: Client<true>,
  handler: CommandKit
) {
  const username = interaction.options.getString("username");
  if (!username)
    return interaction.reply({ content: "Please provide a username.", ephemeral: true });

  try {
    await client.user.setUsername(username);
  } catch (error) {
    return interaction.reply({
      content: `An error occurred while changing the username: \`\`\`${error}\`\`\``,
      ephemeral: true,
    });
  }

  return interaction.reply({
    embeds: [BasicEmbed(client, "Username Changed", `The bot's username has been changed.`)],
    ephemeral: true,
  });
}

async function changeNickname(
  interaction: ChatInputCommandInteraction,
  client: Client<true>,
  handler: CommandKit
) {
  const nickname = interaction.options.getString("nickname");
  if (!nickname)
    return interaction.reply({ content: "Please provide a nickname.", ephemeral: true });

  const getter = new ThingGetter(client);
  const guild = await getter.getGuild(interaction.guildId!);
  if (!guild) return interaction.reply("The nickname can only be changed in a guild.");

  try {
    await guild.members.me?.setNickname(nickname);
  } catch (error) {
    return interaction.reply({
      content: `An error occurred while changing the nickname: \`\`\`${error}\`\`\``,
      ephemeral: true,
    });
  }
  return interaction.reply({
    embeds: [BasicEmbed(client, "Nickname Changed", `The bot's nickname has been changed.`)],
    ephemeral: true,
  });
}

async function changeStatus(
  interaction: ChatInputCommandInteraction,
  client: Client<true>,
  handler: CommandKit
) {
  const activityString = interaction.options.getString("activity");
  const text = interaction.options.getString("text");
  if (!activityString || !text)
    return interaction.reply({
      content: "Please provide a status, activity type and activity text",
      ephemeral: true,
    });

  const activityType = ActivityEnum[activityString];

  try {
    client.user.setActivity(text, { type: activityType as any });
  } catch (error) {
    return interaction.reply({
      content: "Invalid activity or status.",
      ephemeral: true,
    });
  }

  const db = new Database();
  db.findOneAndUpdate(
    Settings,
    { botId: client.user.id },
    { activityText: text, activityType: activityType }
  );

  return interaction.reply({
    embeds: [BasicEmbed(client, "Status Changed", `The bot's status has been changed.`)],
    ephemeral: true,
  });
}

export enum ActivityEnum {
  competing = ActivityType.Competing,
  listening = ActivityType.Listening,
  playing = ActivityType.Playing,
  streaming = ActivityType.Streaming,
  watching = ActivityType.Watching,
}
