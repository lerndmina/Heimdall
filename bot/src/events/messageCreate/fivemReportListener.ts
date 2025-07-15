import { ChannelType, Client, Message } from "discord.js";
import Database from "../../utils/data/database";
import FetchEnvs, { DEFAULT_OPTIONAL_STRING } from "../../utils/FetchEnvs";
import FivemReportListener from "../../models/FivemReportListener";
import log from "../../utils/log";
import {
  FivemReport,
  FivemReportMessageActions,
  FivemReportMessageArgs,
} from "../../types/FivemTypes";
import { tryCatch } from "../../utils/trycatch";
import { fetchReportById } from "../../services/FivemReportService";
const env = FetchEnvs();
const db = new Database();

if (env.ENABLE_FIVEM_SYSTEMS && env.FIVEM_MYSQL_URI !== DEFAULT_OPTIONAL_STRING) {
  module.exports = {
    default: async (message: Message, client: Client<true>): Promise<boolean | void> => {
      if (!message.webhookId) return false;
      if (message.author.id === client.user?.id) return false;
      if (message.channel.type !== ChannelType.GuildText) return false;

      const reportConfig = await db.findOne(
        FivemReportListener,
        {
          listenChannelId: message.channel.id,
        },
        true
      );
      if (!reportConfig) return false;
      if (!message.content.startsWith(reportConfig.prefix)) return false;
      log.debug(`[FivemReportListener]`, {
        info: "Message detected",
        messageAuthor: message.author.globalName ? message.author.globalName : "Webhook/Unknown",
        messageContent: message.content,
      });

      tryCatch(message.delete());

      const messageArgsArray = message.content.slice(reportConfig.prefix.length).trim().split(";");
      const messageDetails = {
        id: messageArgsArray[0].split(":")[1],
        action: messageArgsArray[1].split(":")[1] as FivemReportMessageActions,
        context: messageArgsArray[2].split(":")[1],
      } as FivemReportMessageArgs;

      if (messageDetails.action !== FivemReportMessageActions.NewReport) {
        log.debug(`[FivemReportListener]`, {
          info: "Message is not a new report",
          messageAuthor: message.author.globalName ? message.author.globalName : "Webhook/Unknown",
          messageDetails: messageDetails,
        });
        return true;
      }

      // Fetch report using the service
      const report = await fetchReportById(messageDetails.id);

      if (!report) {
        log.error(`[FivemReportListener]`, {
          error: "Report not found or failed to fetch",
          messageAuthor: message.author.globalName ? message.author.globalName : "Webhook/Unknown",
          messageContent: message.content,
        });
        return true;
      }

      if (report.category.type !== "bug") {
        log.debug(`[FivemReportListener]`, {
          error: "Report category is not a bug",
          messageAuthor: message.author.globalName ? message.author.globalName : "Webhook/Unknown",
          messageContent: message.content,
        });
        return true;
      }

      log.debug(`[FivemReportListener]`, {
        info: "Report found",
        messageAuthor: message.author.globalName ? message.author.globalName : "Webhook/Unknown",
        messageContent: message.content,
        reportDetails: report,
      });

      // Build fancy embed
      const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

      // Determine embed color based on priority
      let embedColor;
      switch (report.priority.type) {
        case "critical":
          embedColor = 0xf53d6b; // Red for critical bugs
          break;
        case "normal":
          embedColor = 0x4caf50; // Green for normal bugs
          break;
        default:
          embedColor = 0x3498db; // Default blue
      }

      // Create the main embed - specifically formatted for bug reports
      const reportEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`🐛 Bug Report: ${report.title}`)
        .setDescription(report.description)
        .addFields(
          { name: "🆔 Bug ID", value: report.ticketID, inline: true },
          { name: "⚠️ Severity", value: report.priority.text, inline: true },
          {
            name: "📊 Status",
            value: report.status.charAt(0).toUpperCase() + report.status.slice(1),
            inline: true,
          },
          { name: "📅 Reported On", value: report.date, inline: true },
          { name: "👤 Reported By", value: report.ticketOwnerDetails.name, inline: true },
          { name: "🔗 Discord", value: `<@${report.ticketOwnerDetails.discordID}>`, inline: true }
        )
        .setFooter({ text: `Bug Tracking System` })
        .setTimestamp(new Date());

      // Add thumbnail of avatar if it's a valid URL (not relative path)
      if (report.ticketOwnerDetails.avatar && !report.ticketOwnerDetails.avatar.startsWith("./")) {
        reportEmbed.setThumbnail(report.ticketOwnerDetails.avatar);
      }

      // Check for media attachments
      const firstMessage = report.messages[0];
      const hasMedia = firstMessage && firstMessage.media && firstMessage.media.length > 0; // If there's media, add it to the embed - screenshots are especially important for bug reports
      if (hasMedia) {
        const firstMediaItem = firstMessage.media[0];

        // Check if it's an image by URL or file extension
        const isImage = (url: string): boolean => {
          const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
          const lowercaseUrl = url.toLowerCase();
          return (
            imageExtensions.some((ext) => lowercaseUrl.endsWith(ext)) ||
            lowercaseUrl.includes("/image/") ||
            lowercaseUrl.includes("/img/")
          );
        };

        // Add the first media as image if it has an image URL
        if (firstMediaItem.fileURL && isImage(firstMediaItem.fileURL)) {
          reportEmbed.setImage(firstMediaItem.fileURL);
        }

        // If there are multiple media items, or if the first item wasn't an image
        if (
          firstMessage.media.length > 1 ||
          (firstMediaItem.fileURL && !isImage(firstMediaItem.fileURL))
        ) {
          // Determine starting index based on whether first item was used as an image
          const startIndex = firstMediaItem.fileURL && isImage(firstMediaItem.fileURL) ? 1 : 0;

          // Create a string with all media links
          const mediaLinks = firstMessage.media
            .slice(startIndex) // Skip the first one if it was displayed as image
            .map((media, index) => {
              if (media.fileURL) {
                return `[Media ${index + startIndex + 1}](${media.fileURL})`;
              }
              return null;
            })
            .filter(Boolean) // Remove nulls (in case some media don't have URLs)
            .join(" • ");

          reportEmbed.addFields({
            name: "📷 Additional Media",
            value: mediaLinks || "No viewable Media available",
          });
        }
      }

      // Create action buttons with more bug-specific terminology
      const canReproduceButton = new ButtonBuilder()
        .setCustomId(`fivem-report-can_reproduce:${report.ticketID}`)
        .setLabel("Can Reproduce")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✅");

      const cannotReproduceButton = new ButtonBuilder()
        .setCustomId(`fivem-report-cannot_reproduce:${report.ticketID}`)
        .setLabel("Can't Reproduce")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌");

      // Create action row with buttons
      const actionRow = new ActionRowBuilder().addComponents(
        canReproduceButton,
        cannotReproduceButton
      );

      // Store the embed and components to be sent later
      const embedData = {
        embeds: [reportEmbed],
        components: [actionRow],
      };

      const channel = await client.channels.fetch(reportConfig.reportChannelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        log.error(`[FivemReportListener]`, {
          error: "Report channel not found or not a text channel",
          messageAuthor: message.author.globalName ? message.author.globalName : "Webhook/Unknown",
          messageContent: message.content,
        });
        return true;
      }

      const sentMessage = await channel.send(embedData).catch((error: Error) => {
        log.error(`[FivemReportListener]`, {
          error: "Error sending message to report channel",
          messageAuthor: message.author.globalName ? message.author.globalName : "Webhook/Unknown",
          messageContent: message.content,
          errorDetails: error.message,
        });
      });

      return sentMessage ? true : false;
    },
  };
}
