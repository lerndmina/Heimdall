import { ChannelType, ForumChannel, SlashCommandBuilder, ThreadChannel } from "discord.js";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import Modmail from "../../models/Modmail";
import { waitingEmoji } from "../../Bot";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import { CommandOptions, SlashCommandProps } from "commandkit";
import log from "../../utils/log";
import FetchEnvs from "../../utils/FetchEnvs";
import closeModmail from "../../subcommands/modmail/closeModmail";
import banModmail, { banModmailOptions } from "../../subcommands/modmail/banModmail";
import canRunCommand from "../../utils/canRunCommand";
import sendbuttonModmail, {
  sendModmailButtonOptions,
} from "../../subcommands/modmail/sendbuttonModmail";
import setupModmail, { setupModmailOptions } from "../../subcommands/modmail/setupModmail";
import openModmail, { openModmailOptions } from "../../subcommands/modmail/openModmail";
import neverautocloseModmail from "../../subcommands/modmail/neverautocloseModmail";
import enableautocloseModmail from "../../subcommands/modmail/enableautocloseModmail";
import markresolvedModmail from "../../subcommands/modmail/markresolvedModmail";

const env = FetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("modmail")
  .setDescription("The main modmail command")
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("close")
      .setDescription("Close a modmail thread")
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("The reason for closing the modmail thread")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ban")
      .setDescription("Ban a user from using modmail")
      .addStringOption((option) =>
        option.setName("user").setDescription("The user to ban").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("The reason for the ban").setRequired(true)
      )
      .addIntegerOption((option) =>
        option.setName("duration").setDescription("The duration of the ban").setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("permanent")
          .setDescription("Whether the ban is permanent")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("unban")
      .setDescription("Unban a user from using modmail")
      .addStringOption((option) =>
        option.setName("user").setDescription("The user to unban").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("The reason for the unban").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("sendbutton")
      .setDescription("Send the modmail button in a channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to send the button in")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("setup")
      .setDescription("Setup the modmail system")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to send the button in")
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("The role to ping when a new modmail is created")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("description")
          .setDescription(
            "The description for this server in the modmail system (60 characters max)"
          )
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("open")
      .setDescription("Open a modmail thread")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to open a modmail thread with")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("The reason for opening the modmail thread")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("neverautoclose")
      .setDescription(
        "Permanently disable auto-closing for this modmail thread (Manage Server required)"
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("enableautoclose")
      .setDescription("Re-enable auto-closing for this modmail thread (Manage Server required)")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("markresolved")
      .setDescription("Mark this modmail thread as resolved with user response options")
  )
  .setDMPermission(true);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  // userPermissions: ["ManageMessages"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case "close":
      closeModmail({ interaction, client, handler });
      break;
    case "ban":
      const banCheck = await canRunCommand({ interaction, client, handler }, banModmailOptions);
      if (banCheck !== false) return banCheck;
      banModmail({ interaction, client, handler });
      break;
    case "unban":
      return interaction.reply(`Not implemented yet`);
      break;
    case "sendbutton":
      const sendButtonCheck = await canRunCommand(
        { interaction, client, handler },
        sendModmailButtonOptions
      );
      if (sendButtonCheck !== false) return sendButtonCheck;
      sendbuttonModmail({ interaction, client, handler });
      break;
    case "setup":
      const setupModmailCheck = await canRunCommand(
        { interaction, client, handler },
        setupModmailOptions
      );
      if (setupModmailCheck !== false) return setupModmailCheck;
      setupModmail({ interaction, client, handler });
      break;
    case "open":
      const openModmailCheck = await canRunCommand(
        { interaction, client, handler },
        openModmailOptions
      );
      if (openModmailCheck !== false) return openModmailCheck;
      openModmail({ interaction, client, handler });
      break;
    case "neverautoclose":
      neverautocloseModmail({ interaction, client, handler });
      break;
    case "enableautoclose":
      enableautocloseModmail({ interaction, client, handler });
      break;
    case "markresolved":
      markresolvedModmail({ interaction, client, handler });
      break;
    default:
      return interaction.reply({
        embeds: [ModmailEmbeds.subcommandNotFound(client)],
        ephemeral: true,
      });
  }
}
