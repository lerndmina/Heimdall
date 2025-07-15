import https from "https";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import OpenAI from "openai";
import DownloadFile from "./DownloadFile";
import DeleteFile from "./DeleteFile";
import ConvertFile from "./ConvertFile";
import { Client, Message } from "discord.js";
import { Url } from "url";
import FetchEnvs from "./FetchEnvs";
import log from "./log";

export default async function (client: Client<true>, message: Message, apiKey: string) {
  const openai = new OpenAI({ apiKey: apiKey });
  // check if ffmpeg is installed
  ffmpeg.getAvailableFormats(function (err, formats) {
    if (err) {
      log.error(`FFMPEG ERR: ${err}`);
      const env = FetchEnvs();
      return message.reply(
        `Sorry, there was an error while trying to load FFMPEG. <@${
          env.OWNER_IDS[0]
        }> help me! This happened at <t:${Math.floor(Date.now() / 1000)}>`
      );
    }
  });

  // get message attachments
  const attachments = message.attachments;
  // get the first attachment
  const attachment = attachments.first();

  if (!attachment) return;

  if (attachment.contentType != "audio/ogg") {
    message.reply("Sorry, I can only transcribe ogg files.");
    return;
  } else if (attachment.size > 8000000) {
    message.reply("Sorry, I can only transcribe files smaller than 8MB.");
    return;
  } else {
    message.channel.sendTyping();
  }

  // Download the attachment and name it the current timestamp
  const fileName = Date.now().toString();
  const url = new URL(attachment.url);
  await DownloadFile(url, fileName, "ogg");

  // convert the file to mp3
  await ConvertFile(fileName, "ogg", "mp3");
  DeleteFile(fileName, "ogg");

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(`${fileName}.mp3`),
    model: "whisper-1",
  });

  DeleteFile(fileName, "mp3");

  log.info(
    `Transcribed a message from ${message.author.username} in ${
      !message.channel.isDMBased() ? message.channel.name : "Direct Messages"
    }`
  );

  message.reply(`✨ Voice Transcription:\n\n\`\`\`${transcription.text}\`\`\``);
  return true;
}
