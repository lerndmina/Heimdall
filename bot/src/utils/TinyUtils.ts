import {
  Client,
  Snowflake,
  Guild,
  User,
  Channel,
  ClientApplication,
  BaseInteraction,
  Interaction,
  CommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  InteractionReplyOptions,
  Base,
  RepliableInteraction,
  MessageFlags,
  Message,
  GuildMember,
  ButtonBuilder,
  ButtonStyle,
  Role,
  ChannelType,
  GuildTextBasedChannel,
} from "discord.js";
import FetchEnvs, { isOptionalUnset } from "./FetchEnvs";
import BasicEmbed from "./BasicEmbed";
import { Url } from "url";
import chalk from "chalk";
import { ParsedTime } from "./ParseTimeFromMessage";
import ButtonWrapper from "./ButtonWrapper";
import { randomUUID } from "crypto";
import log from "./log";

const env = FetchEnvs();

// Discord message flags constants
const DISCORD_MESSAGE_FLAGS = {
  FORWARDED: 16384, // Discord's forwarded message flag
  VOICE_MESSAGE: MessageFlags.IsVoiceMessage,
} as const;

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isVoiceMessage(message: Message) {
  return (
    message.flags.bitfield === DISCORD_MESSAGE_FLAGS.VOICE_MESSAGE && message.attachments.size == 1
  );
}

export async function postWebhookToThread(url: Url, threadId: Snowflake, content: string) {
  try {
    await fetch(`${url}?thread_id=${threadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content }),
    });
  } catch (error) {
    console.error(error);
    return false;
  }
  return true;
}

export async function sendDM(userId: Snowflake, content: string, client: Client<true>) {
  try {
    const thingGetter = new ThingGetter(client);
    const user = await thingGetter.getUser(userId);
    if (!user) {
      log.error("Failed to send a DM to user: " + userId + "I couldn't find the user.");
      return;
    }
    return await user.send(content);
  } catch (error) {
    log.error(
      "Failed to send a DM to user: " +
        userId +
        "I probably don't have permission to send DMs to them. Error to follow:"
    );
    log.error(error as string);
  }
}

type ThingGetterGuild = Guild | null | undefined;

export class ThingGetter {
  typeMap: { users: string; channels: string; guilds: string };
  client: Client<boolean>;
  constructor(client: Client<boolean>) {
    this.client = client;
    this.typeMap = {
      users: "users",
      channels: "channels",
      guilds: "guilds",
    };
  }

  async getUser(id: Snowflake) {
    return this.#get(id, "users") as unknown as User; // This is technically safe
  }

  async getChannel(id: Snowflake) {
    return this.#get(id, "channels") as unknown as Channel; // This is technically safe
  }

  async getGuild(id: Snowflake) {
    return this.#get(id, "guilds") as unknown as Guild; // This is technically safe
  }

  async getMember(guild: ThingGetterGuild, id: Snowflake): Promise<GuildMember | null> {
    if (!guild) return null; // If guild is null or undefined, return null
    const member = guild.members.cache.get(id);
    return member ? member : await guild.members.fetch(id);
  }

  async getRole(guild: ThingGetterGuild, id: Snowflake): Promise<Role | null> {
    if (!guild) {
      return null; // If guild is null or undefined, return null
    }
    const role = guild.roles.cache.get(id);
    return role ? role : await guild.roles.fetch(id);
  }

  async getMessage(channel: Channel, id: Snowflake): Promise<Message | null> {
    const message = (channel as any).messages.cache.get(id);
    if (!message) {
      return await (channel as any).messages.fetch(id);
    }
    return null;
  }

  async getMessageFromUrl(url: URL): Promise<Message | null> {
    debugMsg(`Getting message from url: ${url.href}`);
    const discordLinkReg = /https:\/\/discord.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
    const match = discordLinkReg.exec(url.href);
    if (!match) {
      throw new Error("Invalid message url. Does not match discord message regex.");
    }
    // const guildId = match[1]; // Might be useful later
    const channelId = match[2];
    const messageId = match[3];

    const channel = (await this.client.channels.fetch(channelId)) as GuildTextBasedChannel;
    if (!channel) {
      throw new Error("Failed to fetch channel from url.");
    }
    const message = await channel.messages.fetch(messageId);
    if (!message) {
      throw new Error("Failed to fetch message from url.");
    }
    return message;
  }

  getMemberName(guildMember: GuildMember | User | null | undefined): string {
    if (!guildMember) {
      return "Unknown User";
    }
    if (guildMember instanceof User) {
      return this.getUsername(guildMember);
    }
    return guildMember.nickname || this.getUsername(guildMember.user);
  }

  getUsername(user: User) {
    return user.globalName || user.username;
  }

  async #get(id: Snowflake, type: "users" | "channels" | "guilds") {
    var start = env.DEBUG_LOG ? Date.now() : undefined;
    const property = this.typeMap[type];
    if (!property) {
      throw new Error(`Invalid type: ${type}`);
    }

    let thing = (this.client as any)[property].cache.get(id);
    if (!thing) {
      thing = await (this.client as any)[property].fetch(id);
    }
    if (env.DEBUG_LOG) debugMsg(`ThingGetter - Time taken: ${Date.now() - start!}ms`);
    return thing;
  }
}

export function debugMsg(msg: string | Object) {
  log.debug(msg);
}

export async function returnMessage(
  interaction: RepliableInteraction,
  client: Client<true>,
  title: string,
  message: string,
  args: { error?: boolean; firstMsg?: boolean; ephemeral?: boolean } = {
    error: false,
    firstMsg: false,
    ephemeral: true,
  }
) {
  const embed = BasicEmbed(
    client,
    args.error ? "Error" : title,
    message.toString(),
    undefined,
    args.error ? "Red" : "Green"
  );

  try {
    if (args.firstMsg) {
      return await interaction.reply({
        content: "",
        embeds: [embed],
        ephemeral: args.ephemeral,
      });
    }
    await interaction.editReply({
      content: "",
      embeds: [embed],
    });
  } catch (error) {
    // @ts-expect-error
    await interaction.channel?.send({
      content: "",
      embeds: [embed],
    });
  }
}

export function getTagKey(guildId: Snowflake, tagName: string) {
  return `${guildId}:${tagName}`;
}

export function upperCaseFirstLetter(string: string) {
  if (!string) return;
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * @description Replaces all occurrences of the literal string "\n" with the newline character in the given string.
 */
export function parseNewlines(string: string) {
  return string.replace(/\\n/g, "\n");
}

export function getTagName(tagKey: string) {
  return tagKey.split(":")[1];
}

export function stripMotdColor(text: string) {
  // Regular expression to match the color code pattern (§ followed by any character)
  const colorCodeRegex = /§./g;

  return text.replace(colorCodeRegex, "");
}

export function flattenStringArray(array: string[] | string) {
  if (typeof array === "string") {
    return array;
  }
  return array.join("\n");
}

export async function prepModmailMessage(
  client: Client<true>,
  message: Message,
  characterLimit: number
) {
  var content = message.content;

  // Debug logging for forwarded message investigation
  if (env.DEBUG_LOG || process.env.DEBUG_MODMAIL === "true") {
    log.debug(`[Modmail Debug] Message properties:`, {
      type: message.type,
      hasReference: !!message.reference,
      reference: message.reference
        ? {
            messageId: message.reference.messageId,
            channelId: message.reference.channelId,
            guildId: message.reference.guildId,
          }
        : null,
      flags: message.flags.bitfield,
      embedsCount: message.embeds.length,
      hasAttachments: message.attachments.size > 0,
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + (content.length > 100 ? "..." : ""),
      stickersCount: message.stickers.size,
      mentionsCount: message.mentions.users.size,
      authorId: message.author.id,
    });
  }

  // Detect and handle forwarded messages
  const forwardedDetection = detectForwardedMessage(message);
  if (forwardedDetection.isForwarded) {
    log.debug(
      `[Modmail] Detected forwarded message with ${forwardedDetection.confidence} confidence:`,
      {
        indicators: forwardedDetection.indicators,
        originalLength: content.length,
        extractedLength: forwardedDetection.extractedContent?.length,
        hasEmbeds: message.embeds.length > 0,
        embedCount: message.embeds.length,
        hasAttachments: message.attachments.size > 0,
        attachmentCount: message.attachments.size,
        shouldFetchOriginal: forwardedDetection.shouldFetchOriginal,
      }
    );

    // Check if this is an empty forwarded message (no content, no embeds, no attachments)
    let hasRealContent =
      content.length > 0 || message.embeds.length > 0 || message.attachments.size > 0;

    if (!hasRealContent) {
      // Try to fetch embeds from referenced message if possible
      if (forwardedDetection.shouldFetchOriginal && message.reference?.messageId) {
        try {
          const originalChannel = await client.channels.fetch(message.reference.channelId);
          if (originalChannel?.isTextBased()) {
            const originalMessage = await originalChannel.messages.fetch(
              message.reference.messageId
            );
            if (originalMessage?.embeds.length > 0) {
              log.debug(`[Modmail] Found embeds in original message, proceeding with forwarding`);
              hasRealContent = true; // We found embeds, so it's not empty
            }
          }
        } catch (error) {
          log.debug(`[Modmail] Failed to fetch original message embeds: ${error}`);
        }
      }

      // If still no real content after trying to fetch embeds, reject the message
      if (!hasRealContent) {
        await message.react("❌");
        const botmessage = await message.reply({
          content: "",
          embeds: [
            BasicEmbed(
              client,
              "Forwarded Message Failed",
              "The message you tried to forward appears to be empty or the content couldn't be retrieved. I probably don't have access to the channel the message was originally sent from.\n\n**What you can do:**\n• Try forwarding the message again\n• Take a screenshot and send that instead\n• Copy and paste the text content manually\n\nForwarded messages sometimes lose their content during transmission, especially embeds and media.",
              undefined,
              "Red"
            ),
          ],
        });
        return null;
      }
    }

    // Format the message with forwarded indicators
    content = formatForwardedMessage(content, forwardedDetection);

    // If we should fetch the original message for embeds, attempt to do so
    if (forwardedDetection.shouldFetchOriginal && message.reference?.messageId) {
      try {
        const originalChannel = await client.channels.fetch(message.reference.channelId);
        if (originalChannel?.isTextBased()) {
          const originalMessage = await originalChannel.messages.fetch(message.reference.messageId);
          if (originalMessage?.embeds.length > 0) {
            log.debug(
              `[Modmail] Fetched ${originalMessage.embeds.length} embeds from original forwarded message`
            );
            // Note: The calling function will need to handle fetching these embeds separately
            // For now, we'll just log that they exist
          }
        }
      } catch (error) {
        log.debug(`[Modmail] Failed to fetch original message embeds: ${error}`);
        // Continue without the original embeds - not a critical failure
      }
    }
  }

  // Remove attachment URL handling since we'll send actual attachment files
  var allContent = content;
  // Allow messages with only attachments, but not empty messages with only stickers
  if (!allContent && message.attachments.size === 0 && message.stickers.size > 0) {
    await message.react("❌");
    const botmessage = await message.reply({
      content: "",
      embeds: [
        BasicEmbed(
          client,
          "Modmail Error",
          "Tried to send an empty message.\n\nStickers are not supported in modmail at this time. Sending a message with a sticker will strip the sticker and send the message without it."
        ),
      ],
    });
    deleteMessage(botmessage, 15000);
  }

  // Return content even if empty, as long as there are attachments OR it's a forwarded message
  if (!allContent && message.attachments.size === 0 && !forwardedDetection.isForwarded) {
    return null; // Truly empty message with no attachments and not forwarded
  }

  if (allContent.length > characterLimit) {
    await message.react("❌");
    const botmessage = await message.reply({
      content: "",
      embeds: [
        BasicEmbed(
          client,
          "Modmail Error",
          `Your message is too long to send. Please keep your messages under ${characterLimit} characters.\n\nThis error can also occur if you somehow managed to send a message with no content.`
        ),
      ],
    });
    deleteMessage(botmessage, 15000);
    return null;
  }
  return allContent;
}

export async function deleteMessage(message: Message, timeout = 0) {
  try {
    if (!timeout) return message.delete();
    await sleep(timeout);
    return message.delete();
  } catch (error) {
    log.error(
      `Failed to delete message: ${message.id} in ${message.channel.id} it may have already been deleted.`
    );
    log.error(error as string);
  }
}

export async function pastebinUrlToJson(url: URL): Promise<JSON> {
  // Check if valid url
  if (url.hostname !== "pastebin.com" && url.hostname !== "shrt.zip") return {} as JSON;

  if (url.hostname === "shrt.zip") {
    url = replaceInUrl(url, "/u/", "/r/");
    url = replaceInUrl(url, "/code/", "/r/");

    const json = await (await fetch(url.href)).json();
    return json;
  }

  if (url.pathname.startsWith("/raw")) return await (await fetch(url.href)).json();

  return await (await fetch(`${url.origin}/raw${url.pathname}`)).json();
}

export function getValidUrl(urlString: string) {
  try {
    return new URL(urlString);
  } catch (error) {
    return null;
  }
}

export function replaceInUrl(url: URL, oldString: string, newString: string) {
  var urlString = url.toString();
  urlString = urlString.replace(oldString, newString);

  return new URL(urlString);
}

export function getTimeMessage(time: ParsedTime, id: Snowflake, ephemeral = false) {
  const buttons = ButtonWrapper([
    new ButtonBuilder()
      .setCustomId("deleteMe-" + id)
      .setLabel("Delete Me")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️"),
    new ButtonBuilder()
      .setCustomId("ts_dmMe-" + id + "-" + time.seconds + "-" + randomUUID())
      .setLabel("I'm on Mobile!")
      .setEmoji("📱")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setURL("https://hammertime.cyou/en-GB?t=" + time.seconds)
      .setLabel("Edit this timestamp")
      .setStyle(ButtonStyle.Link),
  ]);

  const content = `Converted to timestamp: ⏰ <t:${time.seconds}:F>\nUsing the timezone: \`${
    time.tz
  }\`\n\nUse this in your own message: \`\`\`<t:${time.seconds}:F>\`\`\`${
    ephemeral ? "\n\nYou don't have permission to send public timestamps on other's messages." : ""
  }`;

  return { content, components: ephemeral ? [] : buttons, ephemeral };
}

export async function fetchWithRedirectCheck(url: URL) {
  const response = await fetch(url, { redirect: "follow" });
  if (response.type === "opaqueredirect") {
    throw new Error("Redirected to opaque URL, unable to determine final URL");
  }
  return response.url;
}

/**
 * - **DATE**: The short date format (e.g. mm/dd/yyyy or dd/mm/yyyy depending on the locale)<br>
 * - **DATE_TEXT**: The long date format (e.g. DD Month yyyy)
 * - **TIME**: The short time format (e.g. hh:mm:ss AM/PM or 24-hour time depending on the locale)
 * - **TIME_FULL**: The long time format (e.g. hh:mm:ss AM/PM or 24-hour time depending on the locale)
 * - **FULL_SHORT**: DATE_TEXT and the time (e.g. DD Month yyyy hh:mm AM/PM)
 * - **FULL_LONG**: DATE_TEXT and the short time (e.g. DayWeek DD Month yyyy hh:mm AM/PM)
 * - **RELATIVE**: A relative time (e.g. 3 hours ago)
 */
export enum TimeType {
  DATE = "d",
  DATE_TEXT = "D",
  TIME = "t",
  TIME_FULL = "T",
  FULL_SHORT = "f",
  FULL_LONG = "F",
  RELATIVE = "R",
}

/**
 *
 * @param date Number or Date number is in seconds
 * @param type TimeType The type of time format to use
 * @returns Discord date format string for use in messages and embeds
 */
export function getDiscordDate(date: Date | number, type: TimeType): string {
  if (typeof date === "number") {
    date = new Date(date * 1000);
  }
  if (!date) date = new Date();
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${type}>`;
}

export function getOpenaiApiKey() {
  const env = FetchEnvs();
  console.log(chalk.yellow("Fetching OpenAI API Key..."));
  if (isOptionalUnset(env.OPENAI_API_KEY)) {
    console.log(chalk.red("OpenAI API Key is not set!"));
    throw new Error("OPENAI_API_KEY is not set");
  }
  console.log(chalk.green("OpenAI API Key is set!"));
  return env.OPENAI_API_KEY;
}

/**
 * Detect if a message appears to be forwarded content
 * Checks for common forwarded message patterns and indicators
 */
export function detectForwardedMessage(message: Message): {
  isForwarded: boolean;
  confidence: "low" | "medium" | "high";
  indicators: string[];
  extractedContent?: string;
  shouldFetchOriginal?: boolean;
} {
  const indicators: string[] = [];
  const content = message.content;

  // Check for Discord's native forwarding indicators
  if (message.flags.bitfield === DISCORD_MESSAGE_FLAGS.FORWARDED) {
    indicators.push("Discord forwarded message flag detected");
  }

  // Check for message reference with empty/minimal content (common with forwarded embeds)
  if (message.reference && content.length === 0) {
    indicators.push("Has message reference with no content (likely forwarded embed)");
  }

  // Check for Discord's forwarded message patterns in content
  const forwardedPatterns = [
    /^Forwarded from .+:/m,
    /^Forwarded message from .+:/m,
    /^\[Forwarded\]/m,
    /^--- Forwarded Message ---/m,
    /^> .+\n> .+/m, // Quote-style forwarding
    /^From: .+\n/m,
    /^Message from .+:/m,
    /^Originally sent by .+:/m,
  ];

  let patternMatches = 0;
  for (const pattern of forwardedPatterns) {
    if (pattern.test(content)) {
      indicators.push(`Pattern match: ${pattern.source}`);
      patternMatches++;
    }
  }

  // Check message properties that might indicate forwarding
  if (message.reference && message.type === 19) {
    // MessageType.Reply
    indicators.push("Message is a reply");
  }

  if (message.embeds.length > 0) {
    indicators.push(`Has ${message.embeds.length} embed(s)`);

    // Check if embeds contain message-like content
    for (const embed of message.embeds) {
      if (embed.description && embed.description.length > 50) {
        indicators.push("Embed contains substantial content");
      }
      if (embed.author) {
        indicators.push("Embed has author information");
      }
      if (embed.timestamp) {
        indicators.push("Embed has timestamp");
      }
    }
  }

  // Check for quote formatting (common in forwarded messages)
  const quoteLines = content.split("\n").filter((line) => line.startsWith(">"));
  if (quoteLines.length > 2) {
    indicators.push(`Contains ${quoteLines.length} quoted lines`);
  }

  // Check for unusual content structure
  const lines = content.split("\n");
  if (lines.length > 5 && lines.some((line) => line.includes(":") && line.length < 50)) {
    indicators.push("Contains structured metadata-like content");
  }

  // Determine confidence level
  let confidence: "low" | "medium" | "high" = "low";
  let isForwarded = false;
  let shouldFetchOriginal = false;

  // High confidence: Discord's native forwarding flag or clear patterns
  if (message.flags.bitfield === DISCORD_MESSAGE_FLAGS.FORWARDED || patternMatches > 0) {
    confidence = "high";
    isForwarded = true;
    // If we have Discord's forwarded flag with a reference but no content/embeds, fetch original
    if (
      message.flags.bitfield === DISCORD_MESSAGE_FLAGS.FORWARDED &&
      message.reference &&
      content.length === 0 &&
      message.embeds.length === 0
    ) {
      shouldFetchOriginal = true;
    }
  }
  // Medium confidence: Multiple indicators or reference with no content
  else if (indicators.length >= 3 || (message.reference && content.length === 0)) {
    confidence = "medium";
    isForwarded = true;
    // If we have a reference but no content/embeds, we should try to fetch the original
    if (message.reference && content.length === 0 && message.embeds.length === 0) {
      shouldFetchOriginal = true;
    }
  }
  // Low confidence: Some indicators present
  else if (indicators.length >= 1 && (quoteLines.length > 2 || message.embeds.length > 0)) {
    confidence = "low";
    isForwarded = true;
  }

  // Try to extract the actual content from forwarded message
  let extractedContent: string | undefined = undefined;
  if (isForwarded) {
    extractedContent = extractForwardedContent(content);
  }

  return {
    isForwarded,
    confidence,
    indicators,
    extractedContent,
    shouldFetchOriginal,
  };
}

/**
 * Extract the actual message content from a forwarded message
 */
function extractForwardedContent(content: string): string {
  // Remove common forwarded message headers
  let cleaned = content;

  // Remove forwarded message headers
  cleaned = cleaned.replace(/^Forwarded from .+:\s*/gm, "");
  cleaned = cleaned.replace(/^Forwarded message from .+:\s*/gm, "");
  cleaned = cleaned.replace(/^\[Forwarded\]\s*/gm, "");
  cleaned = cleaned.replace(/^--- Forwarded Message ---\s*/gm, "");
  cleaned = cleaned.replace(/^From: .+\n/gm, "");
  cleaned = cleaned.replace(/^Message from .+:\s*/gm, "");
  cleaned = cleaned.replace(/^Originally sent by .+:\s*/gm, "");

  // Remove metadata lines (lines with colons that look like "Author: username")
  const lines = cleaned.split("\n");
  const contentLines = lines.filter((line) => {
    // Keep lines that don't look like metadata
    const isMetadata = /^[A-Za-z\s]+:\s*[^:]*$/.test(line.trim()) && line.trim().length < 50;
    return !isMetadata;
  });

  cleaned = contentLines.join("\n").trim();

  // If we removed too much, return the original
  if (cleaned.length < content.length * 0.3) {
    return content;
  }

  return cleaned;
}

/**
 * Format a message with forwarded message indicators
 */
export function formatForwardedMessage(
  content: string,
  detectionResult: ReturnType<typeof detectForwardedMessage>
): string {
  if (!detectionResult.isForwarded) {
    return content;
  }

  const confidenceEmoji = {
    high: "📤",
    medium: "📤",
    low: "📤",
  };

  const indicator = `${confidenceEmoji[detectionResult.confidence]} **[Forwarded Message]**`;

  // Use extracted content if available, otherwise use original
  const displayContent = detectionResult.extractedContent || content;

  // If there's no content, just return the indicator - let embeds/attachments be the content
  if (!displayContent.trim()) {
    return indicator;
  }

  // Add forwarded indicator at the top
  return `${indicator}\n${displayContent}`;
}

export async function fetchReferencedMessageEmbeds(
  client: Client<true>,
  message: Message
): Promise<any[]> {
  // If message already has embeds, don't fetch additional ones
  if (message.embeds.length > 0) {
    log.debug(
      `[Modmail] Message already has ${message.embeds.length} embeds, not fetching additional`
    );
    return [];
  }

  // If message has a reference, try to get embeds from the original message
  if (message.reference?.messageId) {
    log.debug(`[Modmail] Attempting to fetch embeds from referenced message:`, {
      messageId: message.reference.messageId,
      channelId: message.reference.channelId,
      guildId: message.reference.guildId,
    });

    try {
      const originalChannel = await client.channels.fetch(message.reference.channelId);
      if (!originalChannel) {
        log.debug(`[Modmail] Failed to fetch channel ${message.reference.channelId}`);
        return [];
      }

      if (!originalChannel.isTextBased()) {
        log.debug(`[Modmail] Channel ${message.reference.channelId} is not text-based`);
        return [];
      }

      log.debug(
        `[Modmail] Successfully fetched channel, now fetching message ${message.reference.messageId}`
      );
      const originalMessage = await originalChannel.messages.fetch(message.reference.messageId);

      if (!originalMessage) {
        log.debug(
          `[Modmail] Failed to fetch message ${message.reference.messageId} from channel ${message.reference.channelId}`
        );
        return [];
      }

      log.debug(`[Modmail] Successfully fetched original message:`, {
        messageId: originalMessage.id,
        embedsCount: originalMessage.embeds.length,
        hasContent: !!originalMessage.content,
        contentLength: originalMessage.content.length,
        authorId: originalMessage.author.id,
      });

      if (originalMessage.embeds.length > 0) {
        log.debug(
          `[Modmail] Fetched ${originalMessage.embeds.length} embeds from referenced message`
        );
        return originalMessage.embeds;
      } else {
        log.debug(`[Modmail] Referenced message has no embeds to fetch`);
        return [];
      }
    } catch (error) {
      log.debug(`[Modmail] Failed to fetch referenced message embeds: ${error}`);
    }
  } else {
    log.debug(`[Modmail] Message has no reference, cannot fetch additional embeds`);
  }

  return [];
}
