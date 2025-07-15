import { ButtonBuilder, ButtonStyle, ChannelType, Client, Message, MessageType } from "discord.js";
import ParseTimeFromMessage from "../../utils/ParseTimeFromMessage";
import BasicEmbed from "../../utils/BasicEmbed";
import { ThingGetter, getTimeMessage, sleep } from "../../utils/TinyUtils";
import ButtonWrapper from "../../utils/ButtonWrapper";
import log from "../../utils/log";

export default async function (message: Message, client: Client<true>) {
  if (message.author.bot) return;
  if (message.channel.type != ChannelType.GuildText) return;
  if (
    message.type === MessageType.Reply &&
    !message.author.bot &&
    message.mentions.has(client.user.id)
  )
    handleReplyTrigger(message, client);
  const colonMatches = (message.content.match(/:/g) || []).length;
  const slashMatches = (message.content.match(/\//g) || []).length;
  if (!(colonMatches === 1 && slashMatches === 2)) return;
  if (message.content.includes("http")) return;

  log.info("Processing message for time. . .");

  const data = await ParseTimeFromMessage(message);

  if (!data.success) {
    return false;
  }

  log("We found a time! Parsed time: " + data.date);

  message.reply(getTimeMessage(data, message.author.id));

  return false;
}

async function handleReplyTrigger(reply: Message, client: Client<true>) {
  if (reply.channel.type != ChannelType.GuildText) return;
  console.log("Mentions: ", reply.mentions.users.size);
  const messageId = reply.reference?.messageId;
  if (!messageId) return;
  const originalMessage = await reply.channel.messages.fetch(messageId);
  if (!originalMessage) return;
  if (originalMessage.author.bot) return;

  console.log("Original message: ", originalMessage.content);

  const data = await ParseTimeFromMessage(originalMessage);

  if (!data.success) {
    return false;
  }
  const replyData = {
    ...getTimeMessage(data, originalMessage.author.id),
    allowedMentions: { repliedUser: false },
  };

  originalMessage.reply(replyData);

  try {
    await reply.delete();
  } catch (error) {
    // We don't care if this fails, it's just a cleanup.
  }
}
