import { EmbedBuilder, Message, User, Guild, GuildMember, TextChannel } from "discord.js";
import { ModerationCategory } from "../models/ModeratedChannels";
import { getDiscordDate, TimeType } from "../utils/TinyUtils";

/**
 * Service for creating consistent moderation report embeds
 */
class ModerationEmbedService {
  /**
   * Creates a moderation report embed for a flagged message
   */
  createReportEmbed(
    message: Message,
    flaggedCategories: ModerationCategory[],
    contentTypes: string[],
    confidenceScores?: Record<string, number>
  ): EmbedBuilder {
    const contentType = contentTypes.join(" and ");
    const formattedCategories = flaggedCategories.map((category) =>
      this.formatCategoryName(category)
    );

    const logEmbed = new EmbedBuilder()
      .setTitle(`🚨 ${contentType.charAt(0).toUpperCase() + contentType.slice(1)} flagged`)
      .setColor("#FFA500") // Orange color for flagged content
      .addFields(
        {
          name: "User Details",
          value:
            `User: ${message.author} (${message.author.tag})\n` +
            `ID: ${message.author.id}\n` +
            `Account Created: ${getDiscordDate(
              message.author.createdAt,
              TimeType.DATE
            )} ${getDiscordDate(message.author.createdAt, TimeType.RELATIVE)}\n` +
            `Joined Server: ${getDiscordDate(
              message.member?.joinedAt!,
              TimeType.DATE
            )} ${getDiscordDate(message.member?.joinedAt!, TimeType.RELATIVE)}\n`,
          inline: false,
        },
        {
          name: "Channel",
          value: `<#${message.channel.id}>`,
          inline: true,
        },
        {
          name: "Message Link",
          value: `[Jump to message](${message.url})`,
          inline: true,
        },
        {
          name: "Reason(s)",
          value: formattedCategories.join(", ") || "Flagged content",
          inline: false,
        }
      )
      .setTimestamp();

    // Add message content field if exists
    if (message.content) {
      logEmbed.addFields({
        name: "Message content",
        value:
          message.content.length > 256
            ? `${message.content.substring(0, 253)}...`
            : message.content || "No text content",
        inline: false,
      });
    }

    // Add attachment information if any
    if (message.attachments.size > 0) {
      const attachmentDetails = message.attachments
        .map(
          (a, i) => `[Attachment ${i + 1}](${a.url})${a.contentType ? ` (${a.contentType})` : ""}`
        )
        .join("\n");

      logEmbed.addFields({
        name: "Attachments",
        value: attachmentDetails,
        inline: false,
      });

      // Add first image as thumbnail if it exists
      const firstImage = message.attachments.find((a) => a.contentType?.startsWith("image/"));
      if (firstImage) {
        logEmbed.setImage(firstImage.url);
      }
    }

    // Add confidence scores if available
    if (confidenceScores && Object.keys(confidenceScores).length > 0) {
      const confidenceField = Object.entries(confidenceScores)
        .filter(([category]) => flaggedCategories.includes(category as ModerationCategory))
        .map(([category, score]) => {
          const formattedCategory = this.formatCategoryName(category as ModerationCategory);
          const confidencePercent = (score * 100).toFixed(1);
          return `${formattedCategory}: ${confidencePercent}%`;
        })
        .join("\n");

      if (confidenceField) {
        logEmbed.addFields({
          name: "Confidence Levels",
          value: confidenceField,
          inline: false,
        });
      }
    }

    // Add message link as footer
    logEmbed.setFooter({
      // @ts-expect-error
      text: `Message sent in #${message.channel.name}`,
      iconURL: message.guild?.iconURL() || undefined,
    });

    // Add user avatar as thumbnail
    logEmbed.setThumbnail(message.author.displayAvatarURL());

    return logEmbed;
  }

  /**
   * Updates a report embed to show it was accepted
   */
  markReportAccepted(originalEmbed: EmbedBuilder, user: User): EmbedBuilder {
    return EmbedBuilder.from(originalEmbed)
      .setTitle("✅ Report accepted")
      .setColor("#43B581") // Discord green color
      .setFooter({
        text: `${user.tag} accepted this report • ${new Date().toLocaleString()}`,
        iconURL: user.displayAvatarURL(),
      });
  }

  /**
   * Updates a report embed to show it was ignored/declined
   */
  markReportIgnored(originalEmbed: EmbedBuilder, user: User): EmbedBuilder {
    return EmbedBuilder.from(originalEmbed)
      .setTitle("❌ Report ignored")
      .setColor("#F04747") // Discord red color
      .setFooter({
        text: `${user.tag} ignored this report • ${new Date().toLocaleString()}`,
        iconURL: user.displayAvatarURL(),
      });
  }

  /**
   * Updates a report embed to show what action was taken
   */
  addActionTaken(originalEmbed: EmbedBuilder, actionText: string): EmbedBuilder {
    const updatedEmbed = EmbedBuilder.from(originalEmbed);

    // Check if there's already an Action Taken field
    if (!originalEmbed.data.fields?.find((f) => f.name === "Action Taken")) {
      updatedEmbed.addFields({
        name: "Action Taken",
        value: actionText,
        inline: false,
      });
    }

    return updatedEmbed;
  }

  /**
   * Creates a warning embed for DM to users
   */
  createWarningEmbed(guild: Guild | null, moderator: User, warningMessage?: string): EmbedBuilder {
    const warningEmbed = new EmbedBuilder()
      .setColor("#FF9900") // Warning orange color
      .setTitle("⚠️ Warning Notice")
      .setDescription(
        warningMessage ||
          "Your recent message was flagged for violating our content policy. Please review our server rules."
      )
      .addFields(
        {
          name: "From Server",
          value: guild?.name || "Discord Server",
          inline: true,
        },
        {
          name: "Moderator",
          value: moderator.tag,
          inline: true,
        },
        {
          name: "Date",
          value: new Date().toLocaleString(),
          inline: true,
        }
      )
      .setFooter({
        text: "If you believe this warning was issued in error, please reply here and I'll open a modmail ticket for you.",
        iconURL: guild?.iconURL() || undefined,
      })
      .setTimestamp();

    return warningEmbed;
  }

  /**
   * Creates a timeout notification embed for DM to users
   */
  createTimeoutEmbed(
    guild: Guild | null,
    moderator: User,
    durationMinutes: number,
    reason: string
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setColor("#FF0000") // Red color
      .setTitle("⏰ Timeout Notice")
      .setDescription(
        `You have been timed out in **${
          guild?.name || "a Discord Server"
        }** for ${durationMinutes} minutes`
      )
      .addFields(
        {
          name: "Reason",
          value: reason,
          inline: false,
        },
        {
          name: "Moderator",
          value: moderator.tag,
          inline: true,
        },
        {
          name: "Duration",
          value: `${durationMinutes} minutes`,
          inline: true,
        },
        {
          name: "Expires",
          value: new Date(Date.now() + durationMinutes * 60 * 1000).toLocaleString(),
          inline: true,
        }
      )
      .setFooter({
        text: "If you believe this timeout was issued in error, please contact a server administrator.",
        iconURL: guild?.iconURL() || undefined,
      })
      .setTimestamp();
  }

  /**
   * Creates a message details embed
   */
  createMessageDetailsEmbed(message: Message): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle("Message Details")
      .setDescription(`Detailed information about the flagged message.`)
      .setColor("#5865F2") // Discord blurple
      .addFields(
        {
          name: "Full Message Content",
          value: message.content || "No text content",
          inline: false,
        },
        {
          name: "Message Link",
          value: `[Jump to message](${message.url})`,
          inline: false,
        },
        {
          name: "Channel",
          value: `<#${message.channel.id}>`,
          inline: true,
        },
        {
          name: "Sent At",
          value: `${getDiscordDate(message.createdAt, TimeType.DATE)} ${getDiscordDate(
            message.createdAt,
            TimeType.RELATIVE
          )}`,
          inline: true,
        }
      )
      .setTimestamp();
  }

  /**
   * Format moderation category to readable form
   */
  private formatCategoryName(category: ModerationCategory): string {
    // Replace hyphens with spaces and capitalize words
    return category
      .split("/")
      .map((part) =>
        part
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
      )
      .join(" - ");
  }
}

// Export as singleton
export const moderationEmbeds = new ModerationEmbedService();
