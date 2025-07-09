import { Client, EmbedBuilder, ColorResolvable } from "discord.js";
import { getDiscordDate, TimeType } from "../TinyUtils";

/**
 * Modmail embed utilities for consistent, beautiful messaging
 * - Provides standardized embed messages for all modmail operations
 * - Consistent styling and branding across the system
 * - Type-safe embed creation with proper Discord color handling
 * - Centralized message content to prevent duplication
 */

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export class ModmailEmbeds {
  /**
   * Create a success embed (Green)
   */
  static success(
    client: Client,
    title: string,
    description: string,
    fields?: EmbedField[]
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`✅ ${title}`)
      .setDescription(description)
      .setColor(0x00ff00) // Green
      .setTimestamp()
      .setFooter({
        text: client.user?.username || "Modmail",
        iconURL: client.user?.displayAvatarURL(),
      });

    if (fields && fields.length > 0) {
      embed.addFields(fields);
    }

    return embed;
  }

  /**
   * Create an error embed (Red)
   */
  static error(
    client: Client,
    title: string,
    description: string,
    fields?: EmbedField[]
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`❌ ${title}`)
      .setDescription(description)
      .setColor(0xff0000) // Red
      .setTimestamp()
      .setFooter({
        text: client.user?.username || "Modmail",
        iconURL: client.user?.displayAvatarURL(),
      });

    if (fields && fields.length > 0) {
      embed.addFields(fields);
    }

    return embed;
  }

  /**
   * Create a warning embed (Orange/Yellow)
   */
  static warning(
    client: Client,
    title: string,
    description: string,
    fields?: EmbedField[]
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`⚠️ ${title}`)
      .setDescription(description)
      .setColor(0xffa500) // Orange
      .setTimestamp()
      .setFooter({
        text: client.user?.username || "Modmail",
        iconURL: client.user?.displayAvatarURL(),
      });

    if (fields && fields.length > 0) {
      embed.addFields(fields);
    }

    return embed;
  }

  /**
   * Create an info embed (Blue)
   */
  static info(
    client: Client,
    title: string,
    description: string,
    fields?: EmbedField[]
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`ℹ️ ${title}`)
      .setDescription(description)
      .setColor(0x0099ff) // Blue
      .setTimestamp()
      .setFooter({
        text: client.user?.username || "Modmail",
        iconURL: client.user?.displayAvatarURL(),
      });

    if (fields && fields.length > 0) {
      embed.addFields(fields);
    }

    return embed;
  }

  /**
   * Create a generic modmail embed with custom color
   */
  static generic(
    client: Client,
    title: string,
    description: string,
    color: ColorResolvable = "Random",
    fields?: EmbedField[]
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp()
      .setFooter({
        text: client.user?.username || "Modmail",
        iconURL: client.user?.displayAvatarURL(),
      });

    if (fields && fields.length > 0) {
      embed.addFields(fields);
    }

    return embed;
  }

  // ==================== SPECIFIC MODMAIL MESSAGES ====================

  /**
   * Message shown when user's message is too short
   */
  static shortMessage(
    client: Client,
    currentLength: number,
    minLength: number,
    deleteTime: Date
  ): EmbedBuilder {
    return this.warning(
      client,
      "Message Too Short",
      `**Your message needs more detail to create a modmail ticket.**\n\n` +
        `• **Minimum required:** ${minLength} characters\n` +
        `• **Your message:** ${currentLength} characters\n\n` +
        `**Please include:**\n` +
        `• A clear description of your issue\n` +
        `• Any relevant details or context\n` +
        `• What you've already tried (if applicable)\n\n` +
        `*💡 Tip: Add \`--force\` to your message to bypass this check*\n\n` +
        `This message will be deleted ${getDiscordDate(deleteTime, TimeType.RELATIVE)}.`
    );
  }

  /**
   * Message shown when user uses --force flag
   */
  static forceFlag(client: Client): EmbedBuilder {
    return this.warning(
      client,
      "Force Flag Used",
      "You've bypassed the message length requirement. Staff may ask for additional details if needed."
    );
  }

  /**
   * Message asking user if they want to create a modmail thread
   */
  static createPrompt(client: Client): EmbedBuilder {
    return this.generic(client, "Modmail", "Would you like to create a modmail thread?", "Random");
  }

  /**
   * Message when no servers have modmail enabled
   */
  static noServersAvailable(client: Client): EmbedBuilder {
    return this.info(
      client,
      "No Servers Available",
      "There are no servers that have modmail enabled that you and I are both in."
    );
  }

  /**
   * Message prompting user to select a server
   */
  static selectServer(client: Client): EmbedBuilder {
    return this.generic(
      client,
      "Modmail",
      "Select a server to open a modmail thread in.",
      "Random"
    );
  }

  /**
   * Message when modmail thread creation is cancelled
   */
  static cancelled(client: Client): EmbedBuilder {
    return this.info(client, "Modmail", "Cancelled modmail thread creation.");
  }

  /**
   * Message when user is not a member of selected server
   */
  static notMember(client: Client, guildName: string): EmbedBuilder {
    return this.error(
      client,
      "Not a Member",
      `You are not a member of **${guildName}**. Please join the server to open a modmail thread.`
    );
  }

  /**
   * Message when modmail config is not found
   */
  static configNotFound(client: Client): EmbedBuilder {
    return this.error(
      client,
      "Configuration Error",
      "Modmail configuration not found for this server."
    );
  }

  /**
   * Message when user takes too long to respond
   */
  static timeout(client: Client): EmbedBuilder {
    return this.error(
      client,
      "Timeout",
      "You took too long to respond. Please try again.\n\n" +
        "If you want to open a modmail thread, just DM me again!\n" +
        "This message will delete in 15 seconds."
    );
  }

  /**
   * Message when thread is successfully created
   */
  static threadCreated(
    client: Client,
    guildName: string,
    hasAttachments: boolean = false
  ): EmbedBuilder {
    let description =
      `**Your modmail thread has been created in ${guildName}!**\n\n` +
      `We will get back to you as soon as possible. While you wait, why not grab a hot beverage!\n\n` +
      `Once we have solved your issue, you can use the "Close Thread" button below or \`/modmail close\` to close the thread.\n\n` +
      `If you need to send us more information, just send it here!`;

    if (hasAttachments) {
      description += `\n\n📎 **Your files have been uploaded and will be available to staff.**`;
    }

    return this.success(client, "Thread Created", description);
  }

  /**
   * Message when thread creation fails
   */
  static threadCreationFailed(client: Client, error?: string): EmbedBuilder {
    return this.error(
      client,
      "Thread Creation Failed",
      error || "Failed to create modmail thread. Please try again later."
    );
  }

  /**
   * Message when thread is closed
   */
  static threadClosed(
    client: Client,
    reason: string = "No reason provided",
    closedBy?: string
  ): EmbedBuilder {
    let description =
      `**Your modmail thread has been closed.**\n\n` +
      `**Reason:** ${reason}\n\n` +
      `If you need further assistance, feel free to message me again to create a new thread.`;

    if (closedBy) {
      description += `\n\n**Closed by:** ${closedBy}`;
    }

    return this.info(client, "Thread Closed", description);
  }

  /**
   * Message when user is banned from modmail
   */
  static userBanned(client: Client, reason: string = "No reason provided"): EmbedBuilder {
    return this.error(
      client,
      "Modmail Access Denied",
      `**You have been banned from using modmail.**\n\n` +
        `**Reason:** ${reason}\n\n` +
        `If you believe this is an error, please contact an administrator directly.`
    );
  }

  /**
   * Message shown when thread is marked as resolved
   */
  static threadResolved(client: Client): EmbedBuilder {
    return this.success(
      client,
      "Thread Resolved",
      `**Your issue has been marked as resolved!**\n\n` +
        `If your issue is fully resolved, you can close this thread using the button below.\n\n` +
        `If you still need help or have follow-up questions, just let us know by replying here.\n\n` +
        `*This thread will automatically close in 24 hours if no response is received.*`
    );
  }

  /**
   * Message for staff when thread is opened
   */
  static staffNotification(
    client: Client,
    userName: string,
    openedByStaff: boolean = false,
    staffUsername?: string
  ): EmbedBuilder {
    let description = `Hey! ${userName} has opened a modmail thread!`;

    if (openedByStaff && staffUsername) {
      description += ` (opened by staff member ${staffUsername})`;
    }

    return this.generic(client, "New Modmail Thread", description, "Random");
  }

  /**
   * Message when DM fails during thread creation
   */
  static dmFailed(client: Client): EmbedBuilder {
    return this.warning(
      client,
      "DM Failed",
      "I was unable to send a DM to the user. This modmail thread will be closed. Please contact the user manually."
    );
  }

  /**
   * Message when file upload processing starts
   */
  static fileProcessing(client: Client): EmbedBuilder {
    return this.info(
      client,
      "Processing Files",
      "Your files are being processed and uploaded. Please wait..."
    );
  }

  /**
   * Message when files are successfully processed
   */
  static filesProcessed(client: Client, fileCount: number): EmbedBuilder {
    const plural = fileCount !== 1 ? "s" : "";
    return this.success(
      client,
      "Files Uploaded",
      `Successfully processed ${fileCount} file${plural}. Staff will be able to view them in the thread.`
    );
  }

  /**
   * Message when some files fail to process
   */
  static fileProcessingPartialFailure(
    client: Client,
    successCount: number,
    failureCount: number
  ): EmbedBuilder {
    return this.warning(
      client,
      "Partial File Upload",
      `${successCount} files uploaded successfully, but ${failureCount} files failed to upload. ` +
        `Staff will be able to view the successfully uploaded files.`
    );
  }
}
