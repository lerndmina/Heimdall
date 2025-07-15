import {
  ApplicationCommandSubCommand,
  CacheType,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import { ChannelType } from "discord.js";
import { Channel } from "diagnostics_channel";

import { GuildNewVC } from "../../models/GuildNewVC";
import { ThingGetter } from "../../utils/TinyUtils";
import { CommandData, CommandOptions, CommandProps, SlashCommandProps } from "commandkit";
import log from "../../utils/log";
import Database from "../../utils/data/database";

export const data = new SlashCommandBuilder()
  .setName("tempvc")
  .setDescription("Create or delete a temporary voice channel for this guild.")
  .setDMPermission(false)
  .addSubcommand((subcommand) => {
    return subcommand
      .setName("create")
      .setDescription("Create a temporary voice channel for this guild.")
      .addChannelOption((option) =>
        option.setName("channel").setDescription("The channel you want to use").setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("category")
          .setDescription("What category to put the temp VCs in.")
          .setRequired(true)
          .setMinLength(17)
      )
      .addBooleanOption((option) =>
        option
          .setName("use-sequential-names")
          .setDescription("Use sequential names for the temp VCs.")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("The name of the temp VC if using sequential names.")
          .setRequired(false)
          .setMinLength(1)
      );
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName("delete")
      .setDescription("Delete the temporary voice channel for this guild.")
      .addChannelOption((option) =>
        option.setName("channel").setDescription("The users join.").setRequired(true)
      );
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName("delete-all")
      .setDescription("Delete all temporary voice channels for this guild.");
  });

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const i = interaction as ChatInputCommandInteraction;
  const getter = new ThingGetter(client);
  const subcommand = i.options.getSubcommand();

  if (!subcommand) return log.error("We got a command interaction without a subcommand.");
  if (!i.guild) return log.error("We got a guildOnly command interaction without a guild.");

  const member = await getter.getMember(i.guild, i.user.id);
  if (!member) return interaction.reply({ content: "You are not in this guild.", ephemeral: true });
  if (!member.permissions.has("ManageGuild"))
    return i.reply({ content: "You do not have permission to use this command.", ephemeral: true });

  const query = {
    guildID: i.guild!.id, // This is a guild only command clientside so we can assume a guild exists
  };

  if (subcommand === "create") {
    var channel = i.options.getChannel("channel");
    const useSequentialNames = i.options.getBoolean("use-sequential-names") as boolean;
    const channelName = i.options.getString("name") as string;
    if (!channel) return log.error("Channel is missing on a required command option.");

    const category = i.options.getString("category") as string;

    // Check if the category exists
    const categoryChannel = await getter.getChannel(category);
    if (!categoryChannel) {
      await i.reply({
        content: `The category ${category} does not exist.`,
        ephemeral: true,
      });
      return;
    }

    const categoryChannelName = "name" in categoryChannel ? categoryChannel.name : "`Name Missing`";

    if (categoryChannel.type !== ChannelType.GuildCategory) {
      await i.reply({
        content: `The channel \`${categoryChannelName}\` is not a category.`,
        ephemeral: true,
      });
      return;
    }

    // Check if the channel is a voice channel
    if (channel.type !== ChannelType.GuildVoice) {
      await i.reply({
        content: `The channel \`${categoryChannelName}\` is not a voice channel.`,
        ephemeral: true,
      });

      return;
    }

    if (useSequentialNames) {
      // Check if the name is at least 1 character
      if (channelName.length < 1) {
        await i.reply({
          content: `If selecting to use sequential names, you must include a channel name.`,
          ephemeral: true,
        });
        return;
      }
    }

    await i.reply({
      embeds: [
        BasicEmbed(client, "Creating...", `Creating temp vc under \`${categoryChannel.name}.`),
      ],
    });

    try {
      const db = new Database();
      const vcList = await db.findOne(GuildNewVC, query, true);
      if (vcList) {
        vcList.guildChannelIDs.push({
          channelID: channel.id,
          categoryID: category,
          useSequentialNames,
          channelName,
        });
        await db.findOneAndUpdate(GuildNewVC, query, vcList);
      } else {
        const newVCList = new GuildNewVC({
          guildID: i.guild.id,
          guildChannelIDs: [
            {
              channelID: channel.id,
              categoryID: category,
              useSequentialNames,
              channelName,
            },
          ],
        });
        await db.findOneAndUpdate(GuildNewVC, query, newVCList, { upsert: true, new: true });
      }

      await i.editReply({
        embeds: [
          BasicEmbed(
            client,
            "Success!",
            `Assigned \`${channel.name}.\` to a temp vc under \`${categoryChannel.name}\`.`,
            undefined,
            "#0099ff"
          ),
        ],
      });
    } catch (error) {
      log.info(`Error creating temp vc creator: \`\`\`${error}\`\`\``);

      await i.editReply({
        embeds: [
          BasicEmbed(
            client,
            "Error!",
            `Error creating temp vc creator: \`\`\`${error}\`\`\``,
            undefined,
            "#0099ff"
          ),
        ],
      });
    }
  } else if (subcommand === "delete") {
    // Check if channel is in the DB then delete the entry for it
    var channel = i.options.getChannel("channel");
    if (!channel) return log.error("Channel is missing on a required command option.");

    const db = new Database();
    const vcList = await db.findOne(GuildNewVC, query, true);

    if (!vcList) {
      await i.reply({
        content: `There are no temp VCs for this guild.`,
        ephemeral: true,
      });
      return;
    }

    const vc = vcList.guildChannelIDs.find((vc) => vc.channelID === channel!.id);

    if (!vc) {
      await i.reply({
        content: `The channel \`${channel.name}\` is not a temp VC.`,
        ephemeral: true,
      });
      return;
    }

    await i.reply({
      embeds: [BasicEmbed(client, "Deleting...", `Deleting temp vc creator \`${channel.name}.\``)],
    });

    try {
      vcList.guildChannelIDs = vcList.guildChannelIDs.filter((vc) => vc.channelID !== channel!.id);
      await db.findOneAndUpdate(GuildNewVC, query, vcList);

      await i.editReply({
        embeds: [
          BasicEmbed(
            client,
            "Success!",
            `Deleted temp vc creator \`${channel.name}\`.`,
            undefined,
            "#0099ff"
          ),
        ],
      });
    } catch (error) {
      log.info(`Error deleting temp vc creator:`);
      log.info(error as string);

      await i.editReply({
        embeds: [
          BasicEmbed(
            client,
            "Error!",
            `Error deleting temp vc creator: \`\`\`${error}\`\`\``,
            undefined,
            "#0099ff"
          ),
        ],
      });
    }
  } else if (subcommand === "delete-all") {
    // Delete all temp VCs for this guild
    const db = new Database();
    const vcList = await db.findOne(GuildNewVC, query, true);
    if (!vcList) {
      await i.reply({
        content: `There are no temp VCs for this guild.`,
        ephemeral: true,
      });
      return;
    }
    await i.reply({
      embeds: [BasicEmbed(client, "Deleting...", `Deleting all temp vc creators for this guild.`)],
    });
    try {
      await db.deleteOne(GuildNewVC, query);
      await i.editReply({
        embeds: [
          BasicEmbed(
            client,
            "Success!",
            `Deleted all temp vc creators for this guild.`,
            undefined,
            "#0099ff"
          ),
        ],
      });
    } catch (error) {
      log.info(`Error deleting all temp vc creators:`);
      log.info(error as string);

      await i.editReply({
        embeds: [
          BasicEmbed(
            client,
            "Error!",
            `Error deleting all temp vc creators: \`\`\`${error}\`\`\``,
            undefined,
            "#0099ff"
          ),
        ],
      });
    }
  }
}
