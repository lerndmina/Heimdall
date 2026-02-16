/**
 * ModmailEmbeds - Static utility class for creating consistent modmail embeds
 *
 * Provides pre-styled embed builders for all modmail operations:
 * - Base methods: success, error, warning, info, generic
 * - User messages: thread notifications, bans, resolution
 * - Staff messages: notifications, DM failures, file processing
 * - Command messages: context errors, permissions, general errors
 */

import type { EmbedField, ColorResolvable, User, GuildMember } from "discord.js";
import { HeimdallEmbedBuilder } from "../../lib/utils/components/HeimdallEmbedBuilder.js";

/**
 * Color constants for embed types
 */
export const ModmailColors = {
  SUCCESS: 0x00ff00 as ColorResolvable,
  ERROR: 0xff0000 as ColorResolvable,
  WARNING: 0xffa500 as ColorResolvable,
  INFO: 0x0099ff as ColorResolvable,
  DEFAULT: 0xde3b79 as ColorResolvable,
  RESOLVED: 0x9b59b6 as ColorResolvable,
  CLOSED: 0x95a5a6 as ColorResolvable,
  URGENT: 0xe74c3c as ColorResolvable,
  HIGH: 0xe67e22 as ColorResolvable,
  NORMAL: 0x3498db as ColorResolvable,
  LOW: 0x2ecc71 as ColorResolvable,
} as const;

/**
 * Priority to color mapping
 */
export const PriorityColors: Record<number, ColorResolvable> = {
  1: ModmailColors.LOW,
  2: ModmailColors.NORMAL,
  3: ModmailColors.HIGH,
  4: ModmailColors.URGENT,
};

/**
 * Priority to label mapping
 */
export const PriorityLabels: Record<number, string> = {
  1: "Low",
  2: "Normal",
  3: "High",
  4: "Urgent",
};

/**
 * Helper function to create embed with consistent styling
 */
function createEmbed(title: string, description: string, color: ColorResolvable, fields?: EmbedField[]): HeimdallEmbedBuilder {
  const embed = new HeimdallEmbedBuilder().setTitle(title).setColor(color);

  if (description && description !== "*") {
    embed.setDescription(description);
  }

  if (fields) {
    for (const field of fields) {
      embed.addFields(field);
    }
  }

  return embed;
}

/**
 * Standard footer for all modmail embeds
 */
const MODMAIL_FOOTER = "To contact the staff team, DM this bot and I'll open a ticket for you.";

/**
 * ModmailEmbeds - Static utility class for modmail embed creation
 */
export class ModmailEmbeds {
  // ========================================
  // BASE EMBED METHODS
  // ========================================

  /**
   * Create a success embed (green)
   */
  static success(title: string, description: string, fields?: EmbedField[]): HeimdallEmbedBuilder {
    return createEmbed(`✅ ${title}`, description, ModmailColors.SUCCESS, fields);
  }

  /**
   * Create an error embed (red)
   */
  static error(title: string, description: string, fields?: EmbedField[]): HeimdallEmbedBuilder {
    return createEmbed(`❌ ${title}`, description, ModmailColors.ERROR, fields);
  }

  /**
   * Create a warning embed (orange)
   */
  static warning(title: string, description: string, fields?: EmbedField[]): HeimdallEmbedBuilder {
    return createEmbed(`⚠️ ${title}`, description, ModmailColors.WARNING, fields);
  }

  /**
   * Create an info embed (blue)
   */
  static info(title: string, description: string, fields?: EmbedField[]): HeimdallEmbedBuilder {
    return createEmbed(`ℹ️ ${title}`, description, ModmailColors.INFO, fields);
  }

  /**
   * Create a generic embed with custom color
   */
  static generic(title: string, description: string, color: ColorResolvable, fields?: EmbedField[]): HeimdallEmbedBuilder {
    return createEmbed(title, description, color, fields);
  }

  // ========================================
  // USER-FACING MESSAGES
  // ========================================

  /**
   * Short message indicator for DM context
   */
  static shortMessage(minimumLength: number, currentLength: number): HeimdallEmbedBuilder {
    return ModmailEmbeds.warning(
      "Message Too Short",
      `Your message must be at least **${minimumLength}** characters.\n` +
        `Current length: **${currentLength}** characters.\n\n` +
        `Please provide more details about your issue.\n\n` +
        ModmailEmbeds.detailedMessageTips,
    );
  }

  /**
   * Thread created notification for user
   */
  static threadCreated(guildName: string, categoryName: string, initialMessage?: string): HeimdallEmbedBuilder {
    let description = `Your message has been sent to **${guildName}** staff.\n\n` + `**Category:** ${categoryName}\n\n`;

    if (initialMessage) {
      const truncated = initialMessage.length > 800 ? initialMessage.substring(0, 797) + "..." : initialMessage;
      description += `**Your Message:**\n>>> ${truncated}\n\n`;
    }

    description +=
      `Staff will respond as soon as possible. Continue replying here to add to your conversation.\n\n` + `Once your issue is resolved, you can use the **Close** button below to close the ticket.`;

    return ModmailEmbeds.success("Modmail Created", description).setFooter({ text: MODMAIL_FOOTER });
  }

  /**
   * Thread closed notification — mirrored to both user DM and staff thread
   */
  static threadClosed(closedBy: string, reason?: string): HeimdallEmbedBuilder {
    let description = "**Your modmail thread has been closed.**\n\n";
    description += `**Reason:** ${reason || "No reason provided"}\n\n`;
    description += "If you need further assistance, feel free to message me again to create a new thread.\n\n";
    description += `**Closed by:** ${closedBy}`;

    return ModmailEmbeds.info("Thread Closed", description).setFooter({ text: MODMAIL_FOOTER });
  }

  /**
   * User banned from modmail notification
   */
  static userBanned(guildName: string, reason?: string, expiresAt?: Date): HeimdallEmbedBuilder {
    let description = `You have been banned from using modmail in **${guildName}**.`;

    if (reason) {
      description += `\n\n**Reason:** ${reason}`;
    }

    if (expiresAt) {
      description += `\n\n**Expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`;
    } else {
      description += "\n\nThis ban is permanent.";
    }

    return ModmailEmbeds.error("Modmail Banned", description).setFooter({ text: MODMAIL_FOOTER });
  }

  /**
   * Thread resolved notification — mirrored to both user DM and staff thread
   * User DM version gets Close Thread + I Need More Help buttons (handled by caller)
   */
  static threadResolved(resolvedBy: string, autoCloseHours: number): HeimdallEmbedBuilder {
    return ModmailEmbeds.success(
      "Thread Resolved",
      `**Your issue has been marked as resolved!**\n\n` +
        `If your issue is fully resolved, you can close this thread using the button below.\n\n` +
        `If you still need help or have follow-up questions, just let us know by replying here.\n\n` +
        `*This thread will automatically close in **${autoCloseHours} hours** if no response is received.*`,
    ).setFooter({ text: MODMAIL_FOOTER });
  }

  /**
   * Message sent confirmation for user
   */
  static messageSent(): HeimdallEmbedBuilder {
    return ModmailEmbeds.success("Message Sent", "Your message has been delivered to staff.");
  }

  /**
   * Rate limited notification for user
   */
  static rateLimited(waitSeconds: number): HeimdallEmbedBuilder {
    return ModmailEmbeds.warning("Slow Down", `Please wait **${waitSeconds}** seconds before sending another message.`);
  }

  /**
   * Session expired notification
   */
  static sessionExpired(): HeimdallEmbedBuilder {
    return ModmailEmbeds.error("Session Expired", "Your modmail session has expired. Please start a new conversation.");
  }

  /**
   * Static tips for detailed messages
   * Used in short message warnings and help embeds
   */
  static readonly detailedMessageTips =
    "**Tips for a helpful message:**\n" +
    "• Describe what you need help with\n" +
    "• Include any relevant details or context\n" +
    "• Mention any error messages you've seen\n\n" +
    "💡 **Tip:** Add `--force` to the end of your message to bypass the minimum length requirement.";

  /**
   * Force flag warning - shown when user uses --force to bypass minimum length
   */
  static forceFlag(): HeimdallEmbedBuilder {
    return ModmailEmbeds.warning(
      "Short Message Warning",
      "You're using `--force` to bypass the minimum message length.\n\n" +
        "⚠️ **Note:** Short messages may take longer to resolve as staff may need to ask for more details.\n\n" +
        "Consider providing more context for faster support.",
    );
  }

  /**
   * Ticket claimed notification — mirrored to both user DM and staff thread
   */
  static threadClaimed(staffDisplayName: string): HeimdallEmbedBuilder {
    return ModmailEmbeds.info(
      "Ticket Claimed",
      `Your support ticket has been claimed by **${staffDisplayName}**.\n\n` + `They will be assisting you shortly. Please be patient while they review your request.`,
    ).setFooter({ text: MODMAIL_FOOTER });
  }

  /**
   * Category selection prompt
   */
  static categorySelection(guildName: string, categories: Array<{ name: string; description?: string; emoji?: string }>): HeimdallEmbedBuilder {
    const categoryList = categories
      .map((cat) => {
        const emoji = cat.emoji || "📁";
        const desc = cat.description ? ` - ${cat.description}` : "";
        return `${emoji} **${cat.name}**${desc}`;
      })
      .join("\n");

    return ModmailEmbeds.info("Select a Category", `Please select a category for your message to **${guildName}**:\n\n${categoryList}`);
  }

  /**
   * Form question prompt
   */
  static formQuestion(questionNumber: number, totalQuestions: number, questionLabel: string, placeholder?: string): HeimdallEmbedBuilder {
    const description = placeholder
      ? `**Question ${questionNumber}/${totalQuestions}**\n\n${questionLabel}\n\n*Hint: ${placeholder}*`
      : `**Question ${questionNumber}/${totalQuestions}**\n\n${questionLabel}`;

    return ModmailEmbeds.info("Additional Information Needed", description);
  }

  /**
   * Modal preview — shows upcoming questions before opening the modal
   * Used as a confirmation step after select menu answers to prevent re-interaction bugs
   */
  static formModalPreview(startQuestion: number, endQuestion: number, totalQuestions: number, fieldLabels: string[]): HeimdallEmbedBuilder {
    const range = startQuestion === endQuestion ? `**Question ${startQuestion} of ${totalQuestions}**` : `**Questions ${startQuestion}–${endQuestion} of ${totalQuestions}**`;

    const questionList = fieldLabels.map((label) => `• ${label}`).join("\n");

    const description = `${range}\n\nThe following questions will be asked:\n${questionList}\n\nClick the button below to answer them.`;

    return ModmailEmbeds.info("Additional Information Needed", description);
  }

  /**
   * Review panel showing all answers before submission
   */
  static reviewPanel(guildName: string, categoryName: string, initialMessage: string, answers: Array<{ label: string; value: string }>): HeimdallEmbedBuilder {
    const fields: EmbedField[] = [
      {
        name: "Category",
        value: categoryName,
        inline: true,
      },
      {
        name: "Initial Message",
        value: initialMessage.length > 1000 ? initialMessage.substring(0, 997) + "..." : initialMessage,
        inline: false,
      },
    ];

    // Add form answers as fields
    for (const answer of answers) {
      fields.push({
        name: answer.label,
        value: answer.value.length > 1024 ? answer.value.substring(0, 1021) + "..." : answer.value,
        inline: answer.value.length < 50,
      });
    }

    return ModmailEmbeds.info("Review Your Submission", `Please review your modmail to **${guildName}** before submitting:`, fields);
  }

  // ========================================
  // STAFF-FACING MESSAGES
  // ========================================

  /**
   * Staff notification for new modmail
   */
  static staffNotification(user: User, categoryName: string, ticketNumber: number, priority: number, initialMessage: string, answers?: Array<{ label: string; value: string }>): HeimdallEmbedBuilder {
    const fields: EmbedField[] = [
      {
        name: "User",
        value: `${user.username} (<@${user.id}>)`,
        inline: true,
      },
      {
        name: "Category",
        value: categoryName,
        inline: true,
      },
      {
        name: "Priority",
        value: `${PriorityLabels[priority] || "Normal"}`,
        inline: true,
      },
      {
        name: "Initial Message",
        value: initialMessage.length > 1000 ? initialMessage.substring(0, 997) + "..." : initialMessage,
        inline: false,
      },
    ];

    void answers;

    const embed = ModmailEmbeds.generic(
      `📬 New Modmail #${ticketNumber}`,
      `A new modmail has been created. Click the thread link below to respond.`,
      PriorityColors[priority] || ModmailColors.NORMAL,
      fields,
    );

    return embed;
  }

  /**
   * DM failed notification for staff
   */
  static dmFailed(user: User, reason: string): HeimdallEmbedBuilder {
    return ModmailEmbeds.error("DM Delivery Failed", `Failed to send message to ${user.username}.\n\n**Reason:** ${reason}\n\nThe user may have DMs disabled or has blocked the bot.`);
  }

  /**
   * Files processed notification
   */
  static filesProcessed(successCount: number, failedCount: number, totalSize: string): HeimdallEmbedBuilder {
    if (failedCount === 0) {
      return ModmailEmbeds.success("Files Processed", `Successfully processed **${successCount}** file(s) (${totalSize}).`);
    }

    return ModmailEmbeds.warning("Files Partially Processed", `Processed **${successCount}** file(s) (${totalSize}).\n` + `**${failedCount}** file(s) failed to process.`);
  }

  /**
   * Thread activity update for staff
   */
  static threadActivity(action: "claimed" | "unclaimed" | "escalated" | "transferred" | "pinged", actor: GuildMember | User, details?: string): HeimdallEmbedBuilder {
    // Get display name based on whether it's a GuildMember or User
    const displayName = (actor as GuildMember).displayName ?? (actor as User).username;
    const actionDescriptions: Record<string, string> = {
      claimed: `🔒 Thread claimed by ${displayName}`,
      unclaimed: `🔓 Thread released by ${displayName}`,
      escalated: `🚨 Thread escalated by ${displayName}`,
      transferred: `🔄 Thread transferred by ${displayName}`,
      pinged: `🔔 Staff pinged by ${displayName}`,
    };

    const description = details ? `${actionDescriptions[action]}\n\n${details}` : actionDescriptions[action]!;

    return ModmailEmbeds.info("Thread Update", description);
  }

  /**
   * Auto-close warning for user DM — rich inactivity notice
   * @param inactiveDuration - Human-readable inactive duration (e.g. "1 day 2 hours")
   * @param autoCloseEnabled - Whether auto-close is enabled for this guild
   * @param autoCloseCountdown - Human-readable time until auto-close (e.g. "7 days")
   */
  static inactivityNotice(inactiveDuration: string, autoCloseEnabled: boolean, autoCloseCountdown: string): HeimdallEmbedBuilder {
    let description = `Your modmail thread has been inactive for ${inactiveDuration}. If you no longer need assistance, you can close this thread using the button below.\n\n`;

    if (autoCloseEnabled) {
      description += `**This thread will be automatically closed in ${autoCloseCountdown} if there's no further activity.**\n\n`;
    } else {
      description += `**Auto-close is disabled for this server, so this thread will remain open until manually closed.**\n\n`;
    }

    description += `If you still need help, simply send another message and we'll continue assisting you.`;

    return ModmailEmbeds.warning("🕐 Modmail Inactivity Notice", description).setFooter({
      text: MODMAIL_FOOTER,
    });
  }

  /**
   * Auto-close warning for staff thread — concise version
   * @param inactiveDuration - Human-readable inactive duration
   * @param autoCloseCountdown - Human-readable time until auto-close
   */
  static autoCloseWarning(inactiveDuration: string, autoCloseCountdown: string): HeimdallEmbedBuilder {
    return ModmailEmbeds.warning(
      "Inactivity Warning",
      `This thread has been inactive for **${inactiveDuration}**.\n\n` + `It will be automatically closed in **${autoCloseCountdown}** if there's no further activity.`,
    ).setFooter({
      text: MODMAIL_FOOTER,
    });
  }

  /**
   * Staff message relayed confirmation
   */
  static staffMessageRelayed(isAnonymous: boolean): HeimdallEmbedBuilder {
    const prefix = isAnonymous ? "anonymously " : "";
    return ModmailEmbeds.success("Message Sent", `Your message has been ${prefix}delivered to the user.`);
  }

  // ========================================
  // COMMAND CONTEXT MESSAGES
  // ========================================

  /**
   * Invalid context error (e.g., command used outside modmail thread)
   */
  static invalidContext(expectedContext: string): HeimdallEmbedBuilder {
    return ModmailEmbeds.error("Invalid Context", `This command can only be used ${expectedContext}.`);
  }

  /**
   * No permission error
   */
  static noPermission(requiredPermission?: string): HeimdallEmbedBuilder {
    const description = requiredPermission ? `You don't have permission to use this command.\n\n**Required:** ${requiredPermission}` : "You don't have permission to use this command.";

    return ModmailEmbeds.error("Permission Denied", description);
  }

  /**
   * Generic command error
   */
  static commandError(message: string, details?: string): HeimdallEmbedBuilder {
    const description = details ? `${message}\n\n**Details:** ${details}` : message;
    return ModmailEmbeds.error("Command Error", description);
  }

  /**
   * User not found error
   */
  static userNotFound(identifier?: string): HeimdallEmbedBuilder {
    const description = identifier ? `Could not find user: \`${identifier}\`` : "Could not find the specified user.";

    return ModmailEmbeds.error("User Not Found", description);
  }

  /**
   * Modmail not found error
   */
  static modmailNotFound(identifier?: string): HeimdallEmbedBuilder {
    const description = identifier ? `Could not find modmail: \`${identifier}\`` : "Could not find the specified modmail thread.";

    return ModmailEmbeds.error("Modmail Not Found", description);
  }

  /**
   * Modmail not configured error
   */
  static notConfigured(guildName?: string): HeimdallEmbedBuilder {
    const description = guildName ? `Modmail is not configured for **${guildName}**.` : "Modmail is not configured for this server.";

    return ModmailEmbeds.error("Not Configured", description);
  }

  /**
   * Already exists error (e.g., open modmail already exists)
   */
  static alreadyExists(entityType: string, action?: string): HeimdallEmbedBuilder {
    const description = action ? `A ${entityType} already exists. ${action}` : `A ${entityType} already exists.`;

    return ModmailEmbeds.warning("Already Exists", description);
  }

  /**
   * Confirmation prompt
   */
  static confirmAction(action: string, warning?: string): HeimdallEmbedBuilder {
    const description = warning ? `Are you sure you want to ${action}?\n\n⚠️ **Warning:** ${warning}` : `Are you sure you want to ${action}?`;

    return ModmailEmbeds.warning("Confirm Action", description);
  }

  /**
   * Loading/processing indicator
   */
  static loading(action: string): HeimdallEmbedBuilder {
    return ModmailEmbeds.generic("⏳ Processing...", action, ModmailColors.INFO);
  }

  /**
   * Help/usage information
   */
  static help(commandName: string, usage: string, examples: string[]): HeimdallEmbedBuilder {
    const fields: EmbedField[] = [
      {
        name: "Usage",
        value: `\`${usage}\``,
        inline: false,
      },
      {
        name: "Examples",
        value: examples.map((e) => `\`${e}\``).join("\n"),
        inline: false,
      },
    ];

    return ModmailEmbeds.info(`Help: ${commandName}`, "*", fields);
  }

  // ========================================
  // THREAD-SIDE STAFF NOTIFICATIONS
  // ========================================

  /**
   * Thread closed notification for staff thread — mirrors the user DM embed
   * @deprecated Use threadClosed() directly — embeds are mirrored
   */
  static threadClosedStaff(closedBy: string, reason?: string): HeimdallEmbedBuilder {
    return ModmailEmbeds.threadClosed(closedBy, reason);
  }

  /**
   * Thread resolved notification for staff thread — mirrors the user DM embed
   * @deprecated Use threadResolved() directly — embeds are mirrored
   */
  static threadResolvedStaff(resolvedBy: string, autoCloseHours: number): HeimdallEmbedBuilder {
    return ModmailEmbeds.threadResolved(resolvedBy, autoCloseHours);
  }

  /**
   * Ticket claimed notification for staff thread — mirrors the user DM embed
   * @deprecated Use threadClaimed() directly — embeds are mirrored
   */
  static threadClaimedStaff(staffDisplayName: string): HeimdallEmbedBuilder {
    return ModmailEmbeds.threadClaimed(staffDisplayName);
  }

  // ========================================
  // PHASE 3 - NEED MORE HELP & CLOSE WITH MESSAGE
  // ========================================

  /**
   * User requested additional help (staff notification / SOS embed)
   * Shown in thread when user clicks "I Need More Help"
   */
  static additionalHelpRequested(username: string): HeimdallEmbedBuilder {
    return ModmailEmbeds.warning(
      "🆘 Additional Help Requested",
      `**${username}** has indicated they still need help with their support request.\n\n` + `The auto-close timer has been cancelled. Please continue assisting them.`,
    ).setFooter({ text: MODMAIL_FOOTER });
  }

  /**
   * Final message from staff before closing
   * Shown to user in DM when staff sends a final message with close
   */
  static finalMessageFromStaff(guildName: string, staffDisplayName: string, finalMessage: string, reason?: string): HeimdallEmbedBuilder {
    const fields: EmbedField[] = [
      {
        name: "Final Message",
        value: finalMessage.length > 1024 ? finalMessage.substring(0, 1021) + "..." : finalMessage,
        inline: false,
      },
    ];

    if (reason) {
      fields.push({
        name: "Reason",
        value: reason,
        inline: false,
      });
    }

    return ModmailEmbeds.generic("🔒 Ticket Closed", `Your support ticket with **${guildName}** has been closed by **${staffDisplayName}** with a final message:`, ModmailColors.ERROR, fields);
  }

  /**
   * Confirmation that user's "I Need More Help" request was sent
   */
  static helpRequestSent(): HeimdallEmbedBuilder {
    return ModmailEmbeds.success("Help Request Sent", "Your request for additional help has been sent to staff. They will continue assisting you shortly.");
  }
}

export default ModmailEmbeds;
