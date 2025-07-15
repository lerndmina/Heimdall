import {
  SlashCommandBuilder,
  CommandInteraction,
  Guild,
  Client,
  ChatInputCommandInteraction,
  User,
  userMention,
  PermissionFlagsBits,
} from "discord.js";
import { globalCooldownKey, setCommandCooldown, userCooldownKey, waitingEmoji } from "../../Bot";
import Database from "../../utils/data/database";
import {
  returnMessage,
  getTagKey,
  debugMsg,
  upperCaseFirstLetter,
  getTagName,
  parseNewlines,
  ThingGetter,
} from "../../utils/TinyUtils";
import TagSchema from "../../models/TagSchema";
import { CommandOptions, SlashCommandProps } from "commandkit";
import BasicEmbed from "../../utils/BasicEmbed";
import { env } from "process";
import { initialReply } from "../../utils/initialReply";
import log from "../../utils/log";
const COMMAND_NAME = "tag";
const COMMAND_NAME_TITLE = "Tag";

export const data = new SlashCommandBuilder()
  .setName(COMMAND_NAME)
  .setDescription("Add or delete a tag")
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add")
      .setDescription("Add a tag")
      .addStringOption((option) =>
        option.setName("name").setDescription("The name of the tag").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("content").setDescription("The content of the tag").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete a tag")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("The name of the tag")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("send")
      .setDescription("Send a tag")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("The name of the tag")
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addUserOption((option) =>
        option.setName("user").setDescription("The user to mention").setRequired(false)
      )
  )
  .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List all tags"));

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);
  const name = interaction.options.getString("name")?.toLowerCase();
  const content = interaction.options.getString("content");
  const user = interaction.options.getUser("user");
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;

  try {
    if (subcommand == "add") {
      // I am overriding typescript to say these are not null
      addTag(interaction, client, name!, content!, guild!);
    } else if (subcommand == "delete") {
      deleteTag(interaction, client, name!, guild!);
    } else if (subcommand == "send") {
      sendTag(interaction, client, name!, guild!, user as User);
    } else if (subcommand == "list") {
      listTags(interaction, client, guild!);
    }
  } catch (error: any) {
    return returnMessage(
      interaction,
      client,
      COMMAND_NAME_TITLE,
      `Oh SHIT! We fell back to a emergency try/catch to prevent bot crahses. Whatever happened I didn't expect it.\nPlease report the following error to the bot developer!\n\`\`\`bash\n${
        error.message
      }\`\`\`\n\nThis error happened at ${Date.now()}`,
      { error: true }
    );
  }
}

async function addTag(
  interaction: ChatInputCommandInteraction,
  client: Client<true>,
  name: string,
  content: string,
  guild: Guild
) {
  debugMsg(`Adding Tag ${name}`);
  const db = new Database();
  const tagKey = getTagKey(guild.id, name);
  const tag = await db.findOne(TagSchema, { key: tagKey });
  if (tag) {
    return returnMessage(
      interaction,
      client,
      COMMAND_NAME_TITLE,
      `This tag already exists in the database. Please choose another name or delete the tag first.`
    );
  }

  db.findOneAndUpdate(
    TagSchema,
    { key: tagKey },
    { key: tagKey, guildId: guild.id, tag: parseNewlines(content) }
  );
  cleanCacheForGuild(guild.id); // Tag was added, without cleaning, the cache would be invalid
  return returnMessage(interaction, client, COMMAND_NAME_TITLE, `Tag \`${name}\` added!`);
}

async function deleteTag(
  interaction: ChatInputCommandInteraction,
  client: Client<true>,
  name: string,
  guild: Guild
) {
  debugMsg(`Deleting tag: ${name}`);
  const db = new Database();
  const tagKey = getTagKey(guild.id, name);
  const tag = await db.findOne(TagSchema, { key: tagKey });
  if (!tag) {
    return returnMessage(
      interaction,
      client,
      COMMAND_NAME_TITLE,
      `This tag doesn't exist in the database.`
    );
  }
  db.findOneAndDelete(TagSchema, { key: tagKey });
  cleanCacheForGuild(guild.id); // Tag was deleted, without cleaning, the cache would be invalid
  return returnMessage(interaction, client, COMMAND_NAME_TITLE, `Tag \`${name}\` removed!`);
}

async function sendTag(
  interaction: ChatInputCommandInteraction,
  client: Client<true>,
  name: string,
  guild: Guild,
  user: User
) {
  debugMsg(`Sending tag: ${name}`);
  const db = new Database();
  const tagKey = getTagKey(guild.id, name);
  const tag = await db.findOne(TagSchema, { key: tagKey });
  if (!tag) {
    return returnMessage(
      interaction,
      client,
      COMMAND_NAME_TITLE,
      `This tag doesn't exist in the database.`
    );
  }

  setCommandCooldown(globalCooldownKey(COMMAND_NAME), 15);
  /* 15 seconds cooldown for the tag command */

  returnMessage(interaction, client, COMMAND_NAME_TITLE, `Sending tag \`${name}\`...`);
  const channel = interaction.channel;
  if (channel && "send" in channel) {
    return channel.send({
      content: user ? userMention(user.id) : "",
      embeds: [BasicEmbed(client, `Tags`, tag.tag)],
    });
  } else {
    log.error(
      `Tried to send a tag in a channel that does not support sending messages! Channel ID: ${channel?.id}, Guild ID: ${guild.id}`
    );
    return returnMessage(
      interaction,
      client,
      COMMAND_NAME_TITLE,
      `This channel does not support sending messages! This should never happen. Please report this to the bot developer.`
    );
  }
}

async function listTags(
  interaction: ChatInputCommandInteraction,
  client: Client<true>,
  guild: Guild
) {
  debugMsg(`Listing tags`);
  const getter = new ThingGetter(client);
  const member = await getter.getMember(guild, interaction.user.id);
  if (!member) throw new Error("Member not found");

  if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return returnMessage(
      interaction,
      client,
      COMMAND_NAME_TITLE,
      `You don't have the required permissions to list all tags as it's an expensive operation!`
    );
  }
  const db = new Database();
  const tags = await db.find(TagSchema, { guildId: guild.id });
  if (!tags || tags.length == 0) {
    return returnMessage(interaction, client, COMMAND_NAME_TITLE, `No tags found!`);
  }
  const fields: any = [];
  // Limit to 24 fields (Discord's max is 25, but we might add a note field)
  const maxTagsToShow = tags.length > 25 ? 24 : 25;
  const tagsToShow = tags.slice(0, maxTagsToShow);
  tagsToShow.forEach((tag: any) => {
    const name = upperCaseFirstLetter(getTagName(tag.key));
    let value = `${tag.tag || "No content"}`;

    // Ensure name is not null/undefined and truncate if too long (max 256 characters)
    const safeName = name || "Unknown Tag";
    const fieldName = safeName.length > 256 ? safeName.substring(0, 253) + "..." : safeName;

    // Truncate field value if too long (max 1024 characters)
    if (value.length > 1024) {
      value = value.substring(0, 1021) + "...";
    }

    // Ensure value is not empty (Discord requires non-empty field values)
    if (!value || value.trim().length === 0) {
      value = "No content";
    }

    fields.push({ name: fieldName, value: value, inline: true });
  });

  // Add a note if there are more tags than we can display
  if (tags.length > 25) {
    fields.push({
      name: "Note",
      value: `Showing 25 of ${tags.length} tags. Some tags were not displayed due to Discord's embed limits.`,
      inline: false,
    });
  }

  const embed = BasicEmbed(client, `Tags for ${guild.name}`, `*`, fields);

  return interaction.editReply({ content: "", embeds: [embed] });
}

function cleanCacheForGuild(guildId: string): Promise<Array<any>> {
  const db = new Database();
  const cleaned = db.cleanCache(db.getCacheKeys(TagSchema, `guildId:${guildId}`));
  return cleaned;
}
