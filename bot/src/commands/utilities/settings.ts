import type {
  LegacySlashCommandProps,
  LegacyCommandOptions,
  CommandKit,
} from "@heimdall/command-handler";
import { ActivityType, ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import FetchEnvs from "../../utils/FetchEnvs";
import BasicEmbed from "../../utils/BasicEmbed";
import Database from "../../utils/data/database";
import Settings from "../../models/Settings";
import CommandError from "../../utils/interactionErrors/CommandError";
import { ThingGetter } from "../../utils/TinyUtils";
import handleContext from "../../subcommands/utilities/settings/context";
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
  .addSubcommandGroup((group) =>
    group
      .setName("context")
      .setDescription("Manage AI context for the ask command")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("upload")
          .setDescription("Upload custom AI context from a file")
          .addAttachmentOption((option) =>
            option
              .setName("file")
              .setDescription("Text or markdown file with context")
              .setRequired(true)
          )
          .addBooleanOption((option) =>
            option
              .setName("use-bot-context")
              .setDescription("Include bot knowledge")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("use-custom-context")
              .setDescription("Use custom context")
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("priority")
              .setDescription("Context priority")
              .addChoices(
                { name: "Bot First", value: "bot" },
                { name: "Custom First", value: "custom" },
                { name: "Both Combined", value: "both" }
              )
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("View current AI context configuration")
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("remove").setDescription("Remove custom AI context")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("toggle-bot")
          .setDescription("Enable/disable bot knowledge in AI responses")
          .addBooleanOption((option) =>
            option.setName("enabled").setDescription("Enable bot context").setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("toggle-custom")
          .setDescription("Enable/disable custom context in AI responses")
          .addBooleanOption((option) =>
            option.setName("enabled").setDescription("Enable custom context").setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set-priority")
          .setDescription("Set context priority for AI responses")
          .addStringOption((option) =>
            option
              .setName("priority")
              .setDescription("Context priority")
              .addChoices(
                { name: "Bot First", value: "bot" },
                { name: "Custom First", value: "custom" },
                { name: "Both Combined", value: "both" }
              )
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("export").setDescription("Export current AI context as a file")
      )
  )
  .setDMPermission(true);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  let hasErrored: any;

  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  // Handle context subcommands (different permission requirement)
  if (subcommandGroup === "context") {
    if (!interaction.memberPermissions?.has("ManageGuild")) {
      return interaction.reply({
        content: "You need the 'Manage Guild' permission to manage AI context.",
        ephemeral: true,
      });
    }
    return handleContext({ interaction, client, handler });
  }

  // Bot-level settings require owner permissions
  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
  }

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
