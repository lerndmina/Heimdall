import { Message, Client, ChannelType } from "discord.js";
import Database from "../../utils/data/database";
import log from "../../utils/log";
import AttachmentBlocker, {
  AttachmentType,
  AttachmentTypesResolved,
} from "../../models/AttachmentBlocker";
import { ThingGetter } from "../../utils/TinyUtils";
import BasicEmbed from "../../utils/BasicEmbed";

// Helper function to identify types of detected links
function getDetectedLinkTypes(links: string[]): string {
  const types = new Set<string>();

  for (const link of links) {
    if (link.includes("imgur.com")) {
      types.add("Imgur");
    } else if (link.includes("tenor.com")) {
      types.add("Tenor");
    } else if (link.includes("giphy.com")) {
      types.add("Giphy");
    } else if (link.includes("gfycat.com")) {
      types.add("Gfycat");
    } else if (link.includes("redgifs.com")) {
      types.add("Redgifs");
    } else if (link.includes("discord")) {
      types.add("Discord");
    } else if (link.includes("redd.it")) {
      types.add("Reddit");
    } else if (link.endsWith(".gif")) {
      types.add("GIF");
    } else {
      types.add("Media");
    }
  }

  const typeArray = Array.from(types);
  if (typeArray.length === 1) {
    return `${typeArray[0]} link${links.length > 1 ? "s" : ""}`;
  } else {
    return `Media links`;
  }
}

export default async (message: Message, client: Client<true>) => {
  // Skip if from a bot or is in DMs
  if (message.author.bot || message.channel.type === ChannelType.DM) return;

  const db = new Database();
  const getter = new ThingGetter(client);
  const channelId = message.channel.id;
  // Get channel configuration
  const config = await db.findOne(AttachmentBlocker, { channelId }, true);
  if (!config || config.attachmentTypes.length < 1) return;
  // If ALL is allowed, let everything through
  if (config.attachmentTypes.includes(AttachmentType.ALL)) return;

  // If NONE is set, block all attachments and GIF links
  const isNoneSet = config.attachmentTypes.includes(AttachmentType.NONE);

  // Skip if message has no attachments and no content to check (unless NONE is set)
  if (!isNoneSet && message.attachments.size === 0 && !message.content) return;

  // Track if message should be deleted
  let shouldDelete = false;
  let blockedReasons: string[] = [];
  // Check each attachment
  for (const [_, attachment] of message.attachments.entries()) {
    const mimeType = attachment.contentType?.toLowerCase() || "";

    // If NONE is set, block all attachments
    if (isNoneSet) {
      shouldDelete = true;
      if (blockedReasons.length < 1) {
        blockedReasons.push(`No attachments allowed`);
      }
      continue;
    }

    // Check if attachment type is allowed
    let isAllowed = false;
    for (const type of config.attachmentTypes) {
      if (
        AttachmentTypesResolved[type].includes(mimeType) ||
        AttachmentTypesResolved[type].includes("all")
      ) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      shouldDelete = true;
      if (blockedReasons.length < 1) {
        blockedReasons.push(`Attachment type not allowed: ${mimeType}`);
      } else {
        blockedReasons.push(mimeType);
      }
    }
  } // Only check for GIF links if VIDEO type is NOT allowed OR if NONE is set
  const isVideoAllowed = config.attachmentTypes.includes(AttachmentType.VIDEO);

  if ((!isVideoAllowed || isNoneSet) && message.content) {
    // Check for GIF and media links in message content from various hosting platforms
    const gifPatterns = [
      // Direct .gif links
      /https?:\/\/[^\s]+\.gif(?:\?[^\s]*)?/gi,
      // Imgur patterns (supports various URL formats)
      /https?:\/\/(?:i\.)?imgur\.com\/[a-zA-Z0-9]+(?:\.gif)?/gi,
      /https?:\/\/imgur\.com\/gallery\/[a-zA-Z0-9]+/gi,
      /https?:\/\/imgur\.com\/a\/[a-zA-Z0-9]+/gi,
      // Tenor patterns (Google's GIF platform)
      /https?:\/\/tenor\.com\/view\/[^\s]+/gi,
      /https?:\/\/c\.tenor\.com\/[^\s]+/gi,
      /https?:\/\/media\.tenor\.com\/[^\s]+/gi,
      // Giphy patterns (popular GIF platform)
      /https?:\/\/giphy\.com\/gifs\/[^\s]+/gi,
      /https?:\/\/media\.giphy\.com\/media\/[a-zA-Z0-9]+\/giphy\.gif/gi,
      /https?:\/\/i\.giphy\.com\/[a-zA-Z0-9]+\.gif/gi,
      // Discord CDN (sometimes used for GIFs)
      /https?:\/\/cdn\.discordapp\.com\/attachments\/[0-9]+\/[0-9]+\/[^\s]+\.gif/gi,
      /https?:\/\/media\.discordapp\.net\/attachments\/[0-9]+\/[0-9]+\/[^\s]+\.gif/gi,
      // Reddit patterns
      /https?:\/\/i\.redd\.it\/[^\s]+\.gif/gi,
      // Gfycat patterns (now part of Snapchat)
      /https?:\/\/gfycat\.com\/[a-zA-Z0-9]+/gi,
      /https?:\/\/thumbs\.gfycat\.com\/[^\s]+/gi,
      // Redgifs patterns
      /https?:\/\/(?:www\.)?redgifs\.com\/watch\/[a-zA-Z0-9]+/gi,
      // Generic patterns for other hosts (catches .gifv, .webm, .mp4 etc.)
      /https?:\/\/[^\s]*(?:gif|gifv|webm|mp4)(?:\?[^\s]*)?/gi,
    ];

    let detectedGifLinks: string[] = [];

    for (const pattern of gifPatterns) {
      const matches = message.content.match(pattern);
      if (matches) {
        detectedGifLinks = [...detectedGifLinks, ...matches];
      }
    }

    // Remove duplicates
    detectedGifLinks = [...new Set(detectedGifLinks)];

    if (detectedGifLinks.length > 0) {
      shouldDelete = true;
      const gifCount = detectedGifLinks.length;
      const linkTypes = getDetectedLinkTypes(detectedGifLinks);

      if (blockedReasons.length < 1) {
        blockedReasons.push(`${linkTypes} not allowed`);
      } else {
        blockedReasons.push(`${linkTypes}`);
      }
    }
  }

  // Delete message if needed
  if (shouldDelete && message.deletable) {
    try {
      await message.delete();
      if (config.timeoutDuration > 0) {
        const member = await getter.getMember(message.guild!, message.author.id);
        if (!member) return;

        log.debug(`Timing out user ${message.author.tag} for ${config.timeoutDuration}ms`);

        member
          .timeout(config.timeoutDuration, `AttachmentBlocker: ${blockedReasons.join(", ")}`)
          .catch((e) => {
            log.error("Error timing out user", e);
          });
      }

      try {
        await message.author.send({
          embeds: [
            BasicEmbed(
              client,
              "Attachment Blocker",
              `Your message in <#${
                message.channel.id
              }> was removed. It violated the channel rule: ${blockedReasons.join(", ")}${
                config.timeoutDuration > 0
                  ? `\n\nYou have also been timed out for ${config.timeoutDuration / 1000} seconds.`
                  : ""
              }`
            ),
          ],
        });
      } catch (e) {
        // User might have DMs disabled, just log it
        log.debug(`Couldn't DM user ${message.author.tag} about blocked attachment`);
      }

      log.info(
        `Blocked content from ${message.author.tag} in #${
          message.channel.name
        }: ${blockedReasons.join(", ")}`
      );
    } catch (error) {
      log.error("Error deleting message with blocked content", error);
    }
  }
};
