import { Message, Client, ChannelType } from "discord.js";
import Database from "../../utils/data/database";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";
import AutoThreads from "../../models/AutoThreads";
import log from "../../utils/log";

const db = new Database();
const env = FetchEnvs();

export default async (message: Message, client: Client<true>) => {
  if (!message.author.bot || !message.webhookId) return false;
  if (message.channel.type !== ChannelType.GuildText) return false;
  const threadConfig = await db.findOne(AutoThreads, { channelId: message.channel.id }, true);
  if (!threadConfig) return false;
  if (!threadConfig.regex) {
    log.debug(
      "No regex found for auto thread creation in channel but db entry exists.",
      message.channel.id,
      message.channel.name
    );
    return false;
  }
  if (
    (threadConfig.onlyBots && !message.author.bot) ||
    (threadConfig.onlyWebhooks && !message.webhookId)
  ) {
    log.debug(
      "Message does not match auto thread creation criteria.",
      message.channel.id,
      message.channel.name
    );
    return false;
  }
  // Parse regex string to extract pattern and flags
  let regex: RegExp;
  try {
    if (threadConfig.regex.startsWith("/") && threadConfig.regex.lastIndexOf("/") > 0) {
      // Parse regex with delimiters and flags (e.g., "/pattern/flags")
      const lastSlashIndex = threadConfig.regex.lastIndexOf("/");
      const pattern = threadConfig.regex.slice(1, lastSlashIndex);
      const flags = threadConfig.regex.slice(lastSlashIndex + 1);
      regex = new RegExp(pattern, flags);
      log.debug("Parsed regex with delimiters:", { original: threadConfig.regex, pattern, flags });
    } else {
      // Treat as plain string pattern
      regex = new RegExp(threadConfig.regex);
      log.debug("Using regex as plain pattern:", threadConfig.regex);
    }
  } catch (e) {
    log.error("Invalid regex pattern for auto thread creation:", threadConfig.regex, e);
    return false;
  }

  const messageAsRawText = getAllTextInMessage(message);
  log.debug("Message Raw Text", messageAsRawText);
  log.debug("Testing regex:", {
    pattern: regex.source,
    flags: regex.flags,
    toString: regex.toString(),
  });
  const match = regex.test(messageAsRawText);
  if (!match) {
    log.debug(
      "Message content does not match regex for auto thread creation.",
      message.channel.id,
      message.channel.name,
      regex.toString()
    );
    return false;
  }

  log.debug(
    "Message matches regex for auto thread creation.",
    message.channel.id,
    message.channel.name,
    regex.toString()
  );

  await message.startThread({
    name: `Thread: ${message.author.username}`,
    reason: `Auto thread created by ${client.user.displayName}`,
  });
};

function getAllTextInMessage(message: Message): string {
  let text = message.content;

  // Add attachment names
  if (message.attachments.size > 0) {
    text += " " + message.attachments.map((a) => a.name).join(", ");
  }

  // Add embed content
  if (message.embeds.length > 0) {
    const embedTexts = message.embeds.map((e) => {
      const parts: string[] = [];
      if (e.title) parts.push(e.title);
      if (e.description) parts.push(e.description);
      if (e.author?.name) parts.push(e.author.name);
      if (e.footer?.text) parts.push(e.footer.text);
      if (e.fields.length > 0) {
        parts.push(...e.fields.map((f) => `${f.name}: ${f.value}`));
      }
      return parts.join(" ");
    });
    text += " " + embedTexts.join(" ");
  }

  return text.trim();
}
