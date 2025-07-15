import type { SlashCommandProps, CommandOptions } from "commandkit";
import { ChannelType, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import { initialReply } from "../../utils/initialReply";
import Database from "../../utils/data/database";
import AutoThreads from "../../models/AutoThreads";
import BasicEmbed from "../../utils/BasicEmbed";

export const data = new SlashCommandBuilder()
  .setName("autothreads")
  .setDescription("Add or remove message regex to automatically create threads.")
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add")
      .setDescription("Add a message regex to automatically create threads.")
      .addStringOption((option) =>
        option
          .setName("regex")
          .setDescription("The regex to match messages for thread creation.")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(100)
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to apply this regex to.")
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("only-bots")
          .setDescription("Only apply this regex to messages sent by bots.")
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("only-webhooks")
          .setDescription("Only apply this regex to messages sent by webhooks.")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("remove")
      .setDescription("Remove a message regex from automatically creating threads.")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to remove the regex from.")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("List all message regexes that automatically create threads.")
  );

export const options: CommandOptions = {
  devOnly: true,
  deleted: false,
};

const db = new Database();

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    return interaction.reply({
      content: "This command can only be used in a guild.",
      ephemeral: true,
    });
  }

  await initialReply(interaction, true);

  if (subcommand === "add") {
    const regexString = interaction.options.getString("regex");
    const channel = interaction.options.getChannel("channel");
    const onlyBots = interaction.options.getBoolean("only-bots") ?? false;
    const onlyWebhooks = interaction.options.getBoolean("only-webhooks") ?? false;

    if (!regexString) {
      return interaction.editReply({
        content: "You must provide a regex string to add.",
      });
    }

    if (regexString.length < 1 || regexString.length > 100) {
      return interaction.editReply({
        content: "Regex string must be between 1 and 100 characters.",
      });
    }

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.editReply({
        content: "You must provide a valid guild text channel to apply this regex to.",
      });
    }

    if (onlyBots && onlyWebhooks) {
      return interaction.editReply({
        content: "You cannot set both 'only-bots' and 'only-webhooks' to true.",
      });
    }

    if (!onlyBots && !onlyWebhooks) {
      return interaction.editReply({
        content: "You must set at least one of 'only-bots' or 'only-webhooks' to true.",
      });
    }

    let regex: RegExp | null = null;
    try {
      regex = new RegExp(regexString);
    } catch (e) {
      return interaction.editReply({
        content: "Invalid regex provided. Please provide a valid regex pattern.",
      });
    }

    await db.findOneAndUpdate(
      AutoThreads,
      { channelId: channel.id },
      {
        guildId,
        channelId: channel.id,
        regex: regexString,
        onlyBots,
        onlyWebhooks,
      },
      {
        upsert: true,
        new: true,
      }
    );

    return interaction.editReply({
      content: `Added auto thread regex: \`${regexString}\` for channel ${
        channel ? channel.name : "this channel"
      }.`,
    });
  } else if (subcommand === "remove") {
    const channel = interaction.options.getChannel("channel");

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.editReply({
        content: "You must provide a valid guild text channel to remove the regex from.",
      });
    }

    const result = await db.findOne(AutoThreads, { channelId: channel.id });
    if (!result) {
      return interaction.editReply({
        content: `No auto thread regex found for channel ${channel.name}.`,
      });
    }

    await db.deleteOne(AutoThreads, { channelId: channel.id });

    return interaction.editReply({
      content: `Removed auto thread regex for channel ${channel ? channel.name : "this channel"}.`,
    });
  } else if (subcommand === "list") {
    const results = await AutoThreads.find({ guildId });

    if (results.length === 0) {
      return interaction.editReply({
        content: "No auto thread regexes found for this guild.",
      });
    }

    const embed = BasicEmbed(
      client,
      "Auto Thread Regexes",
      "List of auto thread regexes for this guild:"
    );

    if (results.length > 25) {
      embed.addFields({
        name: "Too many results",
        value: "There are more than 25 auto thread regexes. Only 24 will be shown",
      });

      results.slice(0, 24).forEach((result) => {
        embed.addFields({
          name: `Channel: <#${result.channelId}>`,
          value: `Regex: \`${result.regex}\`\nOnly Bots: ${result.onlyBots}\nOnly Webhooks: ${result.onlyWebhooks}`,
        });
      });
    } else {
      results.forEach((result) => {
        embed.addFields({
          name: `Channel: <#${result.channelId}>`,
          value: `Regex: \`${result.regex}\`\nOnly Bots: ${result.onlyBots}\nOnly Webhooks: ${result.onlyWebhooks}`,
        });
      });
    }

    interaction.editReply({
      content: "",
      embeds: [embed],
    });
  } else {
    return interaction.editReply({
      content: "Invalid subcommand.",
    });
  }
}
