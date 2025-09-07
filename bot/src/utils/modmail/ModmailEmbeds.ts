import { Client, EmbedBuilder, ColorResolvable, EmbedField } from "discord.js";
import { getDiscordDate, TimeType } from "../TinyUtils";
import BasicEmbed from "../BasicEmbed";

/**
 * Modmail embed utilities for consistent, beautiful messaging
 * - Provides standardized embed messages for all modmail operations
 * - Consistent styling and branding across the system
 * - Uses BasicEmbed internally for consistent project-wide styling
 * - Type-safe embed creation with proper Discord color handling
 * - Centralized message content to prevent duplication
 */

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
    return BasicEmbed(client as Client<true>, `✅ ${title}`, description, fields, 0x00ff00);
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
    return BasicEmbed(client as Client<true>, `❌ ${title}`, description, fields, 0xff0000);
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
    return BasicEmbed(client as Client<true>, `⚠️ ${title}`, description, fields, 0xffa500);
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
    return BasicEmbed(client as Client<true>, `ℹ️ ${title}`, description, fields, 0x0099ff);
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
    return BasicEmbed(client as Client<true>, title, description, fields, color);
  }

  // ==================== SPECIFIC MODMAIL MESSAGES ====================

  static detailedMessageTips =
    `**Please include:**\n` +
    `• A clear description of your issue\n` +
    `• Any relevant details or context\n` +
    `• What you've already tried (if applicable)\n\n` +
    `*💡 Tip: Add \`--force\` to your message to bypass this check*\n\n`;

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
        `${this.detailedMessageTips}` +
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
      "You've bypassed the message length requirement.  Staff might close your modmail ticket without warning if they feel the message is too short or lacks detail."
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
      `Staff will get back to you as soon as possible. While you wait, why not grab a hot beverage!\n\n` +
      `Once we have solved your issue, you can use the "Close Thread" button below to close the thread.\n\n` +
      `Please send any additional information or context here, and we will assist you as soon as possible.`;

    if (hasAttachments) {
      description += `\n\n📎 **Your files have been uploaded and will be available to staff.**`;
    }

    return this.success(client, "Thread Created", description);
  }

  /**
   * Message when staff opens a thread for a user
   */
  static staffOpenedThread(client: Client, reason?: string): EmbedBuilder {
    const fields =
      reason && reason !== "(no reason specified)"
        ? [{ name: "Reason", value: reason, inline: false }]
        : [];

    return this.info(
      client,
      "Modmail Thread Opened",
      "Staff have opened a modmail thread for you. Please respond here to communicate with staff.",
      fields
    );
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

  // ==================== COMMAND ERROR MESSAGES ====================

  /**
   * Message when command cannot be used in current context
   */
  static invalidContext(client: Client): EmbedBuilder {
    return this.error(
      client,
      "Invalid Context",
      "This command cannot be used in this context. Please try again from a modmail thread."
    );
  }

  /**
   * Message when database error occurs
   */
  static databaseError(client: Client): EmbedBuilder {
    return this.error(
      client,
      "Database Error",
      "Failed to access modmail data. Please try again later."
    );
  }

  /**
   * Message when channel is not a modmail thread
   */
  static notModmailThread(client: Client): EmbedBuilder {
    return this.error(
      client,
      "Not a Modmail Thread",
      "This channel is not a modmail thread. Use this command only in active modmail threads."
    );
  }

  /**
   * Message when user lacks required permissions
   */
  static noPermission(client: Client): EmbedBuilder {
    return this.error(client, "No Permission", "You don't have permission to use this command.");
  }

  /**
   * Message when modmail thread is already closed
   */
  static alreadyClosed(client: Client): EmbedBuilder {
    return this.warning(client, "Already Closed", "This modmail thread is already closed.");
  }

  /**
   * Message when modmail thread is already resolved
   */
  static alreadyResolved(client: Client): EmbedBuilder {
    return this.warning(
      client,
      "Already Resolved",
      "This modmail thread is already marked as resolved."
    );
  }

  /**
   * Generic success message for command operations
   */
  static commandSuccess(client: Client, message: string): EmbedBuilder {
    return this.success(client, "Success", message);
  }

  /**
   * Message when thread access fails
   */
  static threadError(client: Client): EmbedBuilder {
    return this.error(
      client,
      "Thread Error",
      "Failed to access the modmail thread. It may have been deleted."
    );
  }

  /**
   * Message when thread is successfully closed by staff
   */
  static threadClosedSuccess(
    client: Client,
    reason: string,
    closedBy: string,
    closedByName: string
  ): EmbedBuilder {
    return this.success(
      client,
      "Thread Closed",
      `Successfully closed modmail thread.\n\n**Reason:** ${reason}\n**Closed by:** ${closedBy} (${closedByName})`
    );
  }

  /**
   * Message shown with modmail button for users to create threads
   */
  static buttonMessage(client: Client): EmbedBuilder {
    return this.generic(
      client,
      "Modmail",
      `Click the button below to open a modmail thread and contact staff.\nAlternatively, you can simply send me a DM and I'll open a modmail thread for you.`,
      "Random"
    );
  }

  /**
   * Message when auto-close is already disabled
   */
  static autoCloseAlreadyDisabled(client: Client): EmbedBuilder {
    return this.info(
      client,
      "Already Disabled",
      "Auto-closing is already disabled for this modmail thread."
    );
  }

  /**
   * Message when auto-close is permanently disabled
   */
  static autoCloseDisabled(client: Client, username: string): EmbedBuilder {
    return this.warning(
      client,
      "Auto-Close Permanently Disabled",
      `Auto-closing has been **permanently disabled** for this modmail thread by ${username}.\n\n` +
        `This thread will no longer receive inactivity warnings or be automatically closed due to inactivity.\n\n` +
        `Use \`/modmail enableautoclose\` to re-enable auto-closing if needed.`
    );
  }

  /**
   * Message when auto-close is successfully disabled
   */
  static autoCloseDisabledSuccess(client: Client): EmbedBuilder {
    return this.success(
      client,
      "Success",
      `Auto-closing has been permanently disabled for this modmail thread.\n\n` +
        `This thread will no longer receive inactivity warnings or be automatically closed.\n\n` +
        `Use \`/modmail enableautoclose\` to re-enable auto-closing if needed.`
    );
  }

  /**
   * Message when auto-close is already enabled
   */
  static autoCloseAlreadyEnabled(client: Client): EmbedBuilder {
    return this.info(
      client,
      "Already Enabled",
      "Auto-closing is already enabled for this modmail thread."
    );
  }

  /**
   * Message when auto-close is successfully enabled
   */
  static autoCloseEnabledSuccess(client: Client): EmbedBuilder {
    return this.success(
      client,
      "Success",
      `Auto-closing has been re-enabled for this modmail thread.\n\n` +
        `This thread will now receive inactivity warnings and be automatically closed after periods of inactivity.`
    );
  }

  /**
   * Message when auto-close is re-enabled
   */
  static autoCloseEnabled(client: Client, username: string): EmbedBuilder {
    return this.success(
      client,
      "Auto-Close Re-Enabled",
      `Auto-closing has been **re-enabled** for this modmail thread by ${username}.\n\n` +
        `This thread will now receive inactivity warnings and may be automatically closed due to inactivity.`
    );
  }

  /**
   * Generic error message for command failures
   */
  static commandError(
    client: Client,
    message: string = "An error occurred while processing your request."
  ): EmbedBuilder {
    return this.error(client, "Error", message);
  }

  /**
   * Message when ticket is claimed by staff
   */
  static ticketClaimed(client: Client, staffUsername: string): EmbedBuilder {
    return this.info(
      client,
      "Ticket Claimed",
      `Your support ticket has been claimed by **${staffUsername}**.\n\n` +
        `They will be assisting you shortly. Please be patient while they review your request.`
    );
  }

  /**
   * Message asking for confirmation to close resolved thread
   */
  static confirmCloseResolved(client: Client): EmbedBuilder {
    return this.warning(
      client,
      "Confirm Close Resolved Thread",
      "Are you sure you want to close this resolved modmail thread?"
    );
  }

  /**
   * Message when user requests additional help
   */
  static additionalHelpRequested(client: Client, username: string): EmbedBuilder {
    return this.warning(
      client,
      "Additional Help Requested",
      `${username} has indicated they need more help with their support request.\n\n` +
        `The thread is now active again and staff will continue to assist you.`
    );
  }

  /**
   * Message when user confirms they still need help
   */
  static stillNeedHelp(client: Client): EmbedBuilder {
    return this.info(
      client,
      "Still Need Help",
      `Your request for additional help has been noted. A staff member will continue to assist you.`
    );
  }

  /**
   * Message when subcommand does not exist
   */
  static subcommandNotFound(client: Client): EmbedBuilder {
    return this.error(client, "Subcommand Not Found", "This subcommand does not exist.");
  }

  // ==================== FILE UPLOAD MESSAGES ====================

  /**
   * Standard fallback message for when users need to upload files elsewhere
   */
  static fileUploadFallback = `Please upload to Google Drive or another file sharing service and share the link.`;

  /**
   * File too large for Discord message
   */
  static fileTooLargeForDiscord(fileName: string, fileSize: string): string {
    return (
      `❌ **${fileName}** (${fileSize}) is too large for Discord (8MB limit).\n` +
      `File upload service is currently unavailable. ${this.fileUploadFallback}`
    );
  }

  /**
   * File too large for any service message
   */
  static fileTooLargeOverall(fileName: string, fileSize: string): string {
    return (
      `❌ **${fileName}** (${fileSize}) is too large. Maximum size is 95MB.\n` +
      `Please compress your file or ${this.fileUploadFallback.toLowerCase()}`
    );
  }

  /**
   * File download failed message
   */
  static fileDownloadFailed(fileName: string, fileSize: string): string {
    return (
      `❌ **${fileName}** (${fileSize}) could not be downloaded for processing.\n` +
      this.fileUploadFallback
    );
  }

  /**
   * File processing failed message
   */
  static fileProcessingFailed(fileName: string, fileSize: string): string {
    return `❌ **${fileName}** (${fileSize}) could not be processed.\n` + this.fileUploadFallback;
  }

  /**
   * File upload failed message
   */
  static fileUploadFailed(fileName: string, fileSize: string): string {
    return `❌ **${fileName}** (${fileSize}) could not be uploaded.\n` + this.fileUploadFallback;
  }

  /**
   * File upload service failed message
   */
  static fileUploadServiceFailed(fileName: string, fileSize: string): string {
    return `❌ **${fileName}** (${fileSize}) upload failed.\n` + this.fileUploadFallback;
  }

  /**
   * File upload fallback message for createFileProcessingStatus
   */
  static fileUploadFallbackShort = `use Google Drive or another file sharing service to upload your files and share the link.`;
}
