import { CommandData, CommandOptions, SlashCommandProps } from "commandkit";
import { Attachment, ClientUser, InteractionReplyOptions, SlashCommandBuilder } from "discord.js";
import CommandError from "../../utils/interactionErrors/CommandError";
import edit from "../../subcommands/message/edit";
import { debugMsg, fetchWithRedirectCheck, ThingGetter } from "../../utils/TinyUtils";
import send from "../../subcommands/message/send";
import deleteFunc from "../../subcommands/message/deleteFunc";
import restore from "../../subcommands/message/restore";
import DownloadFile from "../../utils/DownloadFile";
import { readFileSync } from "fs";
import DeleteFile from "../../utils/DeleteFile";
import { waitingEmoji } from "../../Bot";
import log from "../../utils/log";
import axios from "axios";
import FetchEnvs from "../../utils/FetchEnvs";
const env = FetchEnvs();

const SUBCOMMANDS = {
  SEND: "send",
  EDIT: "edit",
  DELETE: "delete",
  RESTORE: "restore",
} as const;

export const data = new SlashCommandBuilder()
  .setName("message")
  .setDescription("Edit & View Messages")
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName(SUBCOMMANDS.SEND)
      .setDescription("Send a message.")
      .addChannelOption((option) =>
        option.setName("channel").setDescription("Where to send the message").setRequired(true)
      )
      .addAttachmentOption((option) =>
        option
          .setName("data")
          .setDescription("Message data file from discohook.org")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("short-link")
          .setDescription("A short link from discohook.org")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName(SUBCOMMANDS.EDIT)
      .setDescription("Edit a message posted by the bot")
      .addStringOption((option) =>
        option.setName("url").setDescription("The url of the message to edit").setRequired(true)
      )
      .addBooleanOption((option) =>
        option
          .setName("remove-components")
          .setRequired(false)
          .setDescription("Remove buttons, etc from the message?")
      )
      .addStringOption((option) =>
        option
          .setName("short-link")
          .setDescription("A short link from discohook.org or shrt.zip")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName(SUBCOMMANDS.DELETE)
      .setDescription("Delete a message")
      .addStringOption((option) =>
        option.setName("url").setDescription("The url of the message to delete.").setRequired(true)
      )
  )
  .addSubcommand((command) =>
    command
      .setName(SUBCOMMANDS.RESTORE)
      .setDescription("Restore a message to discohook, alternatively use the discohook bot.")
      .addStringOption((option) =>
        option.setName("url").setDescription("The url of the message to restore.").setRequired(true)
      )
  );

export const options: CommandOptions = {
  deleted: false,
  devOnly: false,
  userPermissions: ["ManageMessages"],
  botPermissions: ["ManageMessages"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const getter = new ThingGetter(client);
  if (!interaction.guild) {
    return new CommandError("Command must be run in a guild.", interaction, client).send();
  }

  await interaction.reply({ content: waitingEmoji, ephemeral: true });

  try {
    const subcommand = interaction.options.getSubcommand() as keyof typeof SUBCOMMANDS;
    const handlers = {
      [SUBCOMMANDS.EDIT]: edit,
      [SUBCOMMANDS.SEND]: send,
      [SUBCOMMANDS.DELETE]: deleteFunc,
      [SUBCOMMANDS.RESTORE]: restore,
    };

    const handler = handlers[subcommand];
    if (!handler) {
      throw new Error(`Invalid subcommand: ${subcommand}`);
    }

    return await handler({ interaction, client, handler });
  } catch (error) {
    return new CommandError(error, interaction, client).send();
  }
}

export function extractFromDiscohook(url: URL) {
  if (url.host !== "discohook.org") return null;
  const base64 = url.pathname.split("/").pop();
  if (!base64) return null;
  return Buffer.from(base64, "base64").toString("utf-8");
}

export async function messageAttachmentProcessor(
  attachment: Attachment,
  shortLinkString: string
): Promise<InteractionReplyOptions> {
  if (shortLinkString && attachment)
    throw new Error("You can't use both a short link and an attachment.");
  if (!shortLinkString && !attachment)
    throw new Error("You must provide either a short link or an attachment.");

  let contents: string = "";

  if (shortLinkString) {
    let shortLink: URL;
    try {
      shortLink = new URL(shortLinkString);
    } catch (error) {
      throw new Error("Invalid short link.");
    }

    // if (shortLink.host !== "share.discohook.app") throw new Error("Invalid short link.");
    await fetchWithRedirectCheck(shortLink).then((url: string) => (contents = url));
  } else if (attachment) {
    if (!attachment.contentType?.includes("text")) throw new Error("Invalid attachment.");

    const attachmentUrl = new URL(attachment.url);
    const path = `/tmp/${attachment.name}-${Date.now()}`;

    // interaction.deferReply();
    await DownloadFile(attachmentUrl, path, "txt");

    contents = readFileSync(`${path}.txt`, "utf8");
    DeleteFile(path, "txt");
  } else throw new Error("Invalid attachment.");

  if (contents.startsWith("https://discohook.org/?data=")) {
    contents = contents.replace("https://discohook.org/?data=", "");
  } else {
    let json: any;
    try {
      json = JSON.parse(contents);
    } catch (error) {
      throw new Error(
        'Invalid file contents: "json" this is not valid json. Please check the url copied from discohook.'
      );
    }
    return { content: json.content, embeds: json.embeds } as InteractionReplyOptions;
  }

  const jsonString = Buffer.from(contents, "base64").toString("utf8");
  if (!jsonString) {
    throw new Error(
      'Invalid file contents: "base64" this is not valid base64. Please check the url copied from discohook.'
    );
  }
  try {
    JSON.parse(jsonString);
  } catch (error) {
    throw new Error(
      'Invalid file contents: "json" this is not valid json. Please check the url copied from discohook.'
    );
  }

  return JSON.parse(jsonString).messages[0].data as InteractionReplyOptions;
}

export async function createShortenedLinkInZipline(data: string) {
  const url = new URL(env.ZIPLINE_BASEURL + "/api/shorten");
  const token = env.ZIPLINE_TOKEN;

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Max-Views": "10",
      Authorization: `${token}`,
    },
    body: JSON.stringify({ url: data }),
  };

  const response = await fetch(url, options);
  return (await response.json()).url;
}
