import { CommandOptions, CommandProps } from "commandkit";
import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  GuildChannel,
  GuildMember,
  InteractionContextType,
  SlashCommandBuilder,
} from "discord.js";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import Database from "../../utils/data/database";
import WelcomeMessage, { WelcomeMessageSchemaType } from "../../models/WelcomeMessage";
import { initialReply } from "../../utils/initialReply";
import { ThingGetter } from "../../utils/TinyUtils";

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Setup the welcome message for the server")
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add")
      .setDescription("Set the welcome message for the server")
      .addStringOption((option) =>
        option.setName("message").setDescription("The welcome message to set").setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to send the welcome message in")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("remove").setDescription("Remove the welcome message for the server")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("view").setDescription("View the current welcome message settings")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("test")
      .setDescription("Test the welcome message in the current channel")
      .addStringOption((option) =>
        option.setName("message").setDescription("The welcome message to test").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("options").setDescription("View the options for the welcome message command")
  );

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
  botPermissions: ["SendMessages", "EmbedLinks"],
};

const db = new Database();

export async function run(props: CommandProps) {
  try {
    const { interaction, client, handler } = props;
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    log.debug(`Welcome command received with subcommand: ${subcommand}`);

    await initialReply(interaction, true);

    switch (subcommand) {
      case "add": {
        log.debug("Processing 'add' subcommand");
        const message = interaction.options.getString("message", true);
        const channel = interaction.options.getChannel("channel", true) as GuildChannel;

        if (channel.type !== ChannelType.GuildText) {
          await interaction.editReply({
            content: "The specified channel is not a text channel.",
          });
          return;
        }

        if (!guildId) {
          await interaction.editReply({
            content: "This command can only be used in a server.",
          });
          return;
        }

        const permissions = channel.permissionsFor(client.user);
        if (!permissions || !permissions.has("SendMessages")) {
          await interaction.editReply({
            content: "I do not have permission to send messages in that channel.",
          });
          return;
        }

        const result = await addWelcomeMessage(message, channel, guildId);
        await interaction.editReply({
          content: result,
        });
        break;
      }

      case "remove": {
        log.debug("Processing 'remove' subcommand");
        if (!guildId) {
          await interaction.editReply({
            content: "This command can only be used in a server.",
          });
          return;
        }

        const result = await removeWelcomeMessage(guildId);
        await interaction.editReply({
          content: result,
        });
        break;
      }

      case "view": {
        log.debug("Processing 'view' subcommand");
        if (!guildId) {
          await interaction.editReply({
            content: "This command can only be used in a server.",
          });
          return;
        }

        const result = await viewWelcomeMessage(guildId);
        await interaction.editReply({
          content: result,
        });
        break;
      }

      case "test": {
        log.debug("Processing 'test' subcommand");
        const message = interaction.options.getString("message", true);
        if (!guildId) {
          await interaction.editReply({
            content: "This command can only be used in a server.",
          });
          return;
        }

        const channel = interaction.channel as GuildChannel;
        if (channel.type !== ChannelType.GuildText) {
          await interaction.editReply({
            content: "This command can only be used in a text channel.",
          });
          return;
        }

        const permissions = channel.permissionsFor(client.user);
        if (!permissions || !permissions.has("SendMessages")) {
          await interaction.editReply({
            content: "I do not have permission to send messages in this channel.",
          });
          return;
        }

        const welcomeMessage = {
          guildId,
          channelId: channel.id,
          message,
        };

        const result = await SendWelcomeMessage(welcomeMessage, client, interaction.user.id);
        await interaction.editReply({
          content: result.data,
        });
        break;
      }

      case "options": {
        log.debug("Processing 'options' subcommand");
        const optionsList = Object.entries(WelcomeMessageReplacementDocs)
          .map(([key, description]) => `**${key}**: ${description}`)
          .join("\n");

        await interaction.editReply({
          content: `Welcome message options:\n${optionsList}`,
        });
        break;
      }

      default:
        log.debug(`Unknown subcommand received: "${subcommand}"`);
        await interaction.editReply({
          content: "Unknown subcommand.",
        });
    }
  } catch (error) {
    log.error("Error in welcome command:", error);
    if (props.interaction.isChatInputCommand()) {
      await props.interaction.reply({
        content: "An error occurred while processing your request.",
        ephemeral: true,
      });
    }
  }
}

async function addWelcomeMessage(message: string, channel: GuildChannel, guildId: string) {
  const welcomeData = await db.findOne(WelcomeMessage, { guildId }, true);
  if (welcomeData) {
    welcomeData.message = message;
    welcomeData.channelId = channel.id;
    await db.findOneAndUpdate(WelcomeMessage, { guildId }, welcomeData, {
      upsert: true,
      new: false,
    });
  } else {
    const newWelcomeMessage = new WelcomeMessage({
      guildId,
      channelId: channel.id,
      message,
    });
    await db.findOneAndUpdate(WelcomeMessage, { guildId }, newWelcomeMessage, {
      upsert: true,
      new: true,
    });
  }

  return "Welcome message added/updated successfully.";
}

async function removeWelcomeMessage(guildId: string) {
  const welcomeData = await db.findOne(WelcomeMessage, { guildId }, true);
  if (welcomeData) {
    await db.deleteOne(WelcomeMessage, { guildId });
    return "Welcome message removed successfully.";
  } else {
    return "No welcome message found for this server.";
  }
}

async function viewWelcomeMessage(guildId: string) {
  const welcomeData = await db.findOne(WelcomeMessage, { guildId }, true);
  if (welcomeData) {
    return `Welcome message: ${welcomeData.message}\nChannel: <#${welcomeData.channelId}>`;
  } else {
    return "No welcome message set for this server.";
  }
}

let getter: ThingGetter | undefined = undefined;

/**
 * Sends a welcome message to the specified channel.
 * @param welcomeMessage The welcome message data to send.
 * @param client The Discord client instance.
 * @return A promise that resolves to true if the message was sent successfully, or false if there was an error.
 */
export async function SendWelcomeMessage(
  welcomeMessage: WelcomeMessageSchemaType | null,
  client: Client<true>,
  memberId: string
): Promise<{ data: string; success: boolean }> {
  if (!getter) {
    getter = new ThingGetter(client);
  }

  if (!welcomeMessage || !welcomeMessage.channelId || !welcomeMessage.message) {
    log.error("Invalid welcome message data.");
    return { data: "Invalid welcome message data.", success: false };
  }

  try {
    const channel = (await getter.getChannel(welcomeMessage.channelId)) as GuildChannel;
    if (!channel || !channel.isTextBased()) {
      log.error("Welcome channel not found or is not a text channel.");
      return { data: "Welcome channel not found or is not a text channel.", success: false };
    }

    if ("send" in channel) {
      const messageContent = await ParseWelcomeMessage(
        welcomeMessage.message,
        memberId,
        channel.guildId,
        client
      );

      await channel.send({
        content: messageContent,
        allowedMentions: { parse: ["users"] }, // Allow mentions of users
      });

      log.info(`Welcome message sent to channel ${channel.id} in guild ${channel.guildId}.`);
      return { data: "Welcome message sent successfully.", success: true };
    } else {
      log.error("Channel does not support sending messages.");
      return { data: "Channel does not support sending messages.", success: false };
    }
  } catch (error) {
    log.error("Error sending welcome message:", error);
    return { data: "Error sending welcome message.", success: false };
  }
}

const WelcomeMessageReplacementsTemplate: Record<
  string,
  { value: (member: GuildMember, client: Client<true>) => string; description: string }
> = {
  "{username}": {
    value: (member) => member.user.username,
    description: "The username of the member",
  },
  "{botid}": { value: (client) => client.user.id, description: "The ID of the bot" },
  "{mention}": { value: (member) => `<@${member.id}>`, description: "A mention of the member" },
  "{id}": { value: (member) => member.id, description: "The ID of the member" },
  "{guild}": {
    value: (member) => member.guild.name,
    description: "The name of the guild (server)",
  },
  "{newline}": {
    value: () => "\n",
    description: "A newline character",
  },
};

export async function ParseWelcomeMessage(
  message: string,
  memberId: string,
  guildId: string,
  client: Client<true>
): Promise<string> {
  if (!getter) {
    getter = new ThingGetter(client);
  }

  const guild = await getter.getGuild(guildId);
  const member = await getter.getMember(guild, memberId);
  if (!member || !guild) {
    log.error("Member not found for ID:", memberId);
    return message;
  }

  const WelcomeMessageReplacements: Record<string, { value: string; description: string }> =
    Object.fromEntries(
      Object.entries(WelcomeMessageReplacementsTemplate).map(([key, { value, description }]) => [
        key,
        { value: value(member, client), description },
      ])
    );

  let parsedMessage = message;
  for (const [placeholder, { value }] of Object.entries(WelcomeMessageReplacements)) {
    parsedMessage = parsedMessage.replace(
      new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
      value
    );
  }

  return parsedMessage;
}

export const WelcomeMessageReplacementDocs: Record<string, string> = Object.fromEntries(
  Object.entries(WelcomeMessageReplacementsTemplate).map(([key, { description }]) => [
    key,
    description,
  ])
);
