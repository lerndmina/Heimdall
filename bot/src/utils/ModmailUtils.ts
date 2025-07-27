import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ThreadChannel,
  User,
  ButtonBuilder,
  ButtonStyle,
  ForumChannel,
  Guild,
  GuildMember,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { ThingGetter } from "./TinyUtils";
import { tryCatch } from "./trycatch";
import log from "./log";
import FetchEnvs, { envExists } from "./FetchEnvs";
import Database from "./data/database";
import ModmailConfig, { TicketPriority } from "../models/ModmailConfig";
import Modmail, { ModmailType } from "../models/Modmail";
import { ModmailMessageService } from "../services/ModmailMessageService";
import ModmailCache from "./ModmailCache";
import { ModmailEmbeds } from "./modmail/ModmailEmbeds";
import { CategoryManager } from "./modmail/CategoryManager";

const env = FetchEnvs();

/**
 * Get the proper display name for a user in the modmail context
 * Tries to get guild member name first, falls back to username
 */
export async function getModmailUserDisplayName(
  getter: ThingGetter,
  user: User,
  guild?: Guild | null
): Promise<string> {
  if (guild) {
    try {
      const member = await getter.getMember(guild, user.id);
      return `${getter.getMemberName(member)} (${user.username})`;
    } catch (error) {
      // Fallback to user methods if guild member fetch fails
      return getter.getUsername(user);
    }
  } else {
    // No guild context, use user methods
    return getter.getUsername(user);
  }
}

/**
 * Generate a modmail thread name with the format: username | claimedStaff/unknown | truncatedMessage
 * @param username - The user's display name
 * @param claimedStaffName - The name of the staff member who claimed the ticket (or null if unclaimed)
 * @param message - The truncated user message or reason
 * @returns A properly formatted and truncated thread name
 */
export function generateModmailThreadName(
  username: string,
  claimedStaffName: string | null,
  message: string
): string {
  const DISCORD_MAX_THREAD_NAME = 100;

  // Format: username | claimedStaff/unknown | message
  const claimedPart = claimedStaffName || "unknown";
  const baseName = `${username} | ${claimedPart} | `;

  // Calculate remaining space for the message
  const remainingSpace = DISCORD_MAX_THREAD_NAME - baseName.length;

  // Ensure we have at least some space for the message
  if (remainingSpace < 10) {
    // If the username + claimed staff part is too long, truncate the username
    const maxUsernameLength = Math.max(10, DISCORD_MAX_THREAD_NAME - claimedPart.length - 20); // 20 for " | unknown | " + some message space
    const truncatedUsername =
      username.length > maxUsernameLength
        ? username.substring(0, maxUsernameLength - 3) + "..."
        : username;

    const newBaseName = `${truncatedUsername} | ${claimedPart} | `;
    const newRemainingSpace = DISCORD_MAX_THREAD_NAME - newBaseName.length;

    const truncatedMessage =
      message.length > newRemainingSpace
        ? message.substring(0, Math.max(3, newRemainingSpace - 3)) + "..."
        : message;

    return `${newBaseName}${truncatedMessage}`;
  }

  // Truncate the message to fit
  const truncatedMessage =
    message.length > remainingSpace ? message.substring(0, remainingSpace - 3) + "..." : message;

  return `${baseName}${truncatedMessage}`;
}

/**
 * Update a modmail thread name when it's claimed by a staff member
 * @param thread - The Discord thread to rename
 * @param username - The user's display name
 * @param claimedStaffName - The name of the staff member who claimed the ticket
 * @param originalReason - The original reason/message from the thread
 */
export async function updateModmailThreadName(
  thread: ThreadChannel,
  username: string,
  claimedStaffName: string,
  originalReason: string = "Modmail"
): Promise<void> {
  try {
    // Extract the original message from the current thread name
    // Current format might be "username | message" or "username | unknown | message"
    let messageForTitle = originalReason;

    // Try to extract the message part from the current name
    const currentName = thread.name;
    const parts = currentName.split(" | ");

    if (parts.length >= 2) {
      // If it already has the new format (username | staff | message)
      if (parts.length >= 3) {
        messageForTitle = parts.slice(2).join(" | ");
      } else {
        // Old format (username | message)
        messageForTitle = parts.slice(1).join(" | ");
      }
    }

    const newName = generateModmailThreadName(username, claimedStaffName, messageForTitle);

    // Only update if the name actually changed
    if (newName !== currentName) {
      await thread.setName(newName);
      log.debug(`Updated modmail thread name from "${currentName}" to "${newName}"`);
    }
  } catch (error) {
    log.error("Failed to update modmail thread name:", error);
  }
}

/**
 * Send a message to both the user's DMs and the modmail thread
 */
export async function sendMessageToBothChannels(
  client: Client<true>,
  modmail: ModmailType,
  embed: EmbedBuilder,
  content: string = "",
  options?: {
    dmComponents?: ActionRowBuilder<ButtonBuilder>[];
    threadComponents?: ActionRowBuilder<ButtonBuilder>[];
    /** @deprecated Use dmComponents and threadComponents instead */
    components?: ActionRowBuilder<ButtonBuilder>[];
  }
): Promise<{ dmSuccess: boolean; threadSuccess: boolean }> {
  const getter = new ThingGetter(client);
  let dmSuccess = false;
  let threadSuccess = false;

  // Handle backward compatibility
  const dmComponents = options?.dmComponents || options?.components || [];
  const threadComponents = options?.threadComponents || options?.components || [];

  // Send to user DMs
  try {
    const user = await getter.getUser(modmail.userId);
    if (user) {
      await user.send({
        content,
        embeds: [embed],
        components: dmComponents,
      });
      dmSuccess = true;
      log.debug(`Successfully sent modmail message to user ${modmail.userId} via DM`);
    }
  } catch (error) {
    log.warn(`Failed to send modmail message to user ${modmail.userId} via DM:`, error);
  }

  // Send to modmail thread
  try {
    const thread = (await getter.getChannel(modmail.forumThreadId)) as ThreadChannel;
    if (thread) {
      await thread.send({
        content,
        embeds: [embed],
        components: threadComponents,
      });
      threadSuccess = true;
      log.debug(`Successfully sent modmail message to thread ${modmail.forumThreadId}`);
    }
  } catch (error) {
    log.warn(`Failed to send modmail message to thread ${modmail.forumThreadId}:`, error);
  }

  return { dmSuccess, threadSuccess };
}

/**
 * Create disabled resolve buttons
 */
export function createDisabledResolveButtons(): ActionRowBuilder<ButtonBuilder> {
  const closeButton = new ButtonBuilder()
    .setCustomId("modmail_resolve_close_disabled")
    .setLabel("Close Thread")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅")
    .setDisabled(true);

  const continueButton = new ButtonBuilder()
    .setCustomId("modmail_resolve_continue_disabled")
    .setLabel("I Need More Help")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🆘")
    .setDisabled(true);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton, continueButton);
  return row;
}

/**
 * Create a close thread button component
 */
export function createCloseThreadButton(
  customId: string = "modmail_close_thread"
): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel("Close Thread")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🔒");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return row;
}

/**
 * Create a claim ticket button component
 */
export function createClaimButton(): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId("modmail_claim")
    .setLabel("Claim Ticket")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🎫");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return row;
}

/**
 * Create comprehensive modmail action buttons for staff
 */
export function createModmailActionButtons(): ActionRowBuilder<ButtonBuilder>[] {
  // Row 1: Claim and Mark Resolved
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("modmail_claim")
      .setLabel("Claim Ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫"),
    new ButtonBuilder()
      .setCustomId("modmail_mark_resolved")
      .setLabel("Mark Resolved")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
  );

  // Row 2: Close and Ban
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("modmail_close_with_reason")
      .setLabel("Close with Reason")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒"),
    new ButtonBuilder()
      .setCustomId("modmail_ban_user")
      .setLabel("Ban User")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔨")
  );

  return [row1, row2];
}

/**
 * Get the inactivity warning hours from guild config, with fallback to environment or defaults
 */
export function getInactivityWarningHours(config?: any): number {
  if (env.MODMAIL_TESTING_MODE) {
    return 2 / 60; // 2 minutes in testing mode
  }

  // Use config value if provided and valid
  if (config?.inactivityWarningHours && typeof config.inactivityWarningHours === "number") {
    return config.inactivityWarningHours;
  }

  // Fallback to environment variable if available
  if (envExists(env.MODMAIL_INACTIVITY_WARNING_HOURS)) {
    return env.MODMAIL_INACTIVITY_WARNING_HOURS;
  }

  // Default to 24 hours
  return 24;
}

/**
 * Get the auto-close hours from guild config, with fallback to environment or defaults
 */
export function getAutoCloseHours(config?: any): number {
  if (env.MODMAIL_TESTING_MODE) {
    return 5 / 60; // 5 minutes in testing mode
  }

  // Use config value if provided and valid
  if (config?.autoCloseHours && typeof config.autoCloseHours === "number") {
    return config.autoCloseHours;
  }

  // Fallback to environment variable if available
  if (envExists(env.MODMAIL_AUTO_CLOSE_HOURS)) {
    return env.MODMAIL_AUTO_CLOSE_HOURS;
  }

  // Default to 7 days
  return 24 * 7;
}

/**
 * Get the check interval in minutes
 */
export function getCheckIntervalMinutes(): number {
  if (env.MODMAIL_TESTING_MODE) {
    return 0.5; // 30 seconds in testing mode
  }

  return envExists(env.MODMAIL_CHECK_INTERVAL_MINUTES) ? env.MODMAIL_CHECK_INTERVAL_MINUTES : 30; // Default to 30 minutes if not set
}

/**
 * Format hours into a human-readable time string
 */
export function formatTimeHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const totalSeconds = Math.round(hours * 3600);

  // For very short durations (less than 1 minute), show seconds
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds !== 1 ? "s" : ""}`;
  }

  // For durations less than 1 hour, show minutes
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes !== 1 ? "s" : ""}`;
  }

  // For durations 24 hours or longer, show days, hours, and minutes
  if (hours >= 24) {
    const wholeDays = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    const remainingMinutes = Math.round((hours - Math.floor(hours)) * 60);

    const parts: string[] = [];
    parts.push(`${wholeDays} day${wholeDays !== 1 ? "s" : ""}`);
    if (remainingHours > 0) {
      parts.push(`${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`);
    }
    if (remainingMinutes > 0) {
      parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`);
    }

    return parts.join(" ");
  }

  // For longer durations (less than 24 hours), show hours and minutes
  const wholeHours = Math.floor(hours);
  const remainingMinutes = Math.round((hours - wholeHours) * 60);

  const parts: string[] = [];
  if (wholeHours > 0) {
    parts.push(`${wholeHours} hour${wholeHours !== 1 ? "s" : ""}`);
  }
  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`);
  }

  return parts.join(" ");
}

/**
 * Send a modmail close message to both user DMs and thread with consistent styling
 */
export async function sendModmailCloseMessage(
  client: Client<true>,
  modmail: ModmailType,
  closedBy: "User" | "Staff" | "System",
  closedByName: string,
  reason: string
): Promise<{ dmSuccess: boolean; threadSuccess: boolean }> {
  const embed = ModmailEmbeds.threadClosed(client, reason, closedByName);

  return await sendMessageToBothChannels(client, modmail, embed);
}

/**
 * Mark a modmail thread as resolved and notify the user
 */
export async function markModmailAsResolved(
  client: Client<true>,
  modmail: ModmailType & { _id: any },
  resolvedByUsername: string,
  resolvedByUserId: string
): Promise<{ success: boolean; alreadyResolved?: boolean; error?: string }> {
  try {
    const db = new Database();

    // Check if already marked as resolved
    if (modmail.markedResolved) {
      return { success: false, alreadyResolved: true };
    }

    // Update the modmail to mark as resolved
    await db.findOneAndUpdate(
      Modmail,
      { _id: modmail._id },
      {
        markedResolved: true,
        resolvedAt: new Date(),
        // Schedule auto-close in 24 hours
        autoCloseScheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { upsert: false, new: true }
    );

    // Create buttons for user response
    const resolveButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("modmail_resolve_close")
        .setLabel("Close Thread")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId("modmail_resolve_continue")
        .setLabel("I Need More Help")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🆘")
    );

    // Create embed for resolution message
    const resolveEmbed = ModmailEmbeds.threadResolved(client);

    // Send message to both channels - buttons only in DMs
    await sendMessageToBothChannels(client, modmail, resolveEmbed, undefined, {
      dmComponents: [resolveButtons],
      threadComponents: [], // No buttons in thread
    });

    log.info(`Modmail ${modmail._id} marked as resolved by staff member ${resolvedByUserId}`);

    return { success: true };
  } catch (error) {
    log.error("Error marking modmail as resolved:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Create a new modmail thread with consistent behavior
 */
export async function createModmailThread(
  client: Client<true>,
  options: {
    guild: Guild;
    targetUser: User;
    targetMember: GuildMember;
    forumChannel: ForumChannel;
    modmailConfig: any; // ModmailConfigType
    reason?: string;
    openedBy?: {
      type: "User" | "Staff";
      username: string;
      userId: string;
    };
    initialMessage?: string;
    forced?: boolean; // If --forced is used and therefore the message is short
    // Enhanced category support
    categoryId?: string;
    categoryName?: string;
    priority?: TicketPriority;
    ticketNumber?: number;
    formResponses?: Record<string, any>;
    formMetadata?: Record<string, { label: string; type: string }>;
  }
): Promise<
  | {
      success: boolean;
      thread?: ThreadChannel;
      modmail?: ModmailType & { _id: any };
      dmSuccess?: boolean;
      error?: string;
    }
  | undefined
> {
  try {
    const db = new Database();
    const getter = new ThingGetter(client);

    const {
      guild,
      targetUser,
      targetMember,
      forumChannel,
      modmailConfig,
      reason = "(no reason specified)",
      openedBy,
      initialMessage,
    } = options;

    // Clean cache for the user to prevent conflicts with stale data
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*userId:${targetUser.id}*`);
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:${targetUser.id}`);

    // Check if modmail already exists (only check for open threads)
    const existingModmail = await db.findOne(Modmail, { userId: targetUser.id, isClosed: false });
    if (existingModmail) {
      return {
        success: false,
        error: "A modmail thread is already open for this user",
      };
    }

    const memberName = targetMember.user.username; // targetMember.nickname || targetMember.user.displayName;

    // Determine thread name and initial content
    // Check if reason contains force flag and clean it
    let cleanedReason = reason;
    if (reason && reason.includes("-# the user has force")) {
      cleanedReason = reason.split("-# the user has force")[0].trim();
    }

    // Use the new thread naming format: username | claimedStaff/unknown | truncatedMessage
    const messageForTitle =
      cleanedReason && cleanedReason !== "(no reason specified)" ? cleanedReason : "Modmail";

    // If opened by staff, they automatically claim it
    // Generate thread name using the new ticket numbering system
    const claimedStaffName = openedBy?.type === "Staff" ? openedBy.username : null;
    let threadName: string;

    if (options.categoryId && options.ticketNumber && options.priority) {
      // Use enhanced ticket numbering system
      const { TicketNumbering } = await import("./modmail/TicketNumbering");
      const ticketNumbering = new TicketNumbering();

      threadName = ticketNumbering.generateThreadName({
        ticketNumber: options.ticketNumber,
        username: memberName,
        claimedStaffName: claimedStaffName || undefined,
        priority: options.priority,
      });
    } else {
      // Fallback to old system for backward compatibility
      threadName = generateModmailThreadName(memberName, claimedStaffName, messageForTitle);
    }

    let threadContent = "";
    if (openedBy?.type === "Staff") {
      threadContent = `Modmail thread opened for ${targetUser.tag} (<@${targetUser.id}>) by staff member ${openedBy.username} (${openedBy.userId})\n\nReason: ${reason}`;
    } else {
      threadContent = `Modmail thread for ${memberName} | ${targetUser.id} | <@${
        targetUser.id
      }>\n\n Original message: ${initialMessage || reason}${
        targetMember.pending ? "\n\nUser has not fully joined the guild." : ""
      }`;
    }

    // Create the thread
    const thread = await forumChannel.threads.create({
      name: threadName,
      autoArchiveDuration:
        openedBy?.type === "Staff"
          ? ThreadAutoArchiveDuration.OneHour
          : ThreadAutoArchiveDuration.OneWeek,
      message: {
        content: threadContent,
      },
    });

    // Ensure webhook exists for the config
    if (!modmailConfig.webhookId || !modmailConfig.webhookToken) {
      log.info("Creating new webhook for modmail config");
      const webhook = await forumChannel.createWebhook({
        name: "Modmail System",
        avatar: client.user.displayAvatarURL(),
        reason: "Modmail system webhook for relaying user messages.",
      });

      await db.findOneAndUpdate(
        ModmailConfig,
        { guildId: guild.id },
        {
          webhookId: webhook.id,
          webhookToken: webhook.token,
        },
        { new: true, upsert: true }
      );

      // Invalidate cache after config update
      await ModmailCache.invalidateModmailConfig(guild.id);

      // Update the config object
      modmailConfig.webhookId = webhook.id;
      modmailConfig.webhookToken = webhook.token;
    }

    // Send staff notification with action buttons
    // If opened by staff, ping the staff member who opened it, otherwise ping the appropriate staff role
    // Use category-specific staff role if available, otherwise fall back to main config staff role
    let staffRoleIdToMention = modmailConfig.staffRoleId;
    if (options.categoryId) {
      const { CategoryManager } = await import("./modmail/CategoryManager");
      staffRoleIdToMention = CategoryManager.getEffectiveStaffRoleId(
        { id: options.categoryId, staffRoleId: undefined } as any, // We don't have the full category here
        modmailConfig.staffRoleId
      );

      // If we have category info, get the actual category staff role
      if (options.categoryId) {
        const categoryManager = new CategoryManager();
        const category = await categoryManager.getCategoryById(guild.id, options.categoryId);
        if (category?.staffRoleId) {
          staffRoleIdToMention = category.staffRoleId;
        }
      }
    }

    const notificationContent =
      openedBy?.type === "Staff" ? `<@${openedBy.userId}>` : `<@&${staffRoleIdToMention}>`;

    const embeds = [
      ModmailEmbeds.staffNotification(
        client,
        memberName,
        openedBy?.type === "Staff",
        openedBy?.username
      ),
    ];

    // Add form responses embed if any form data was collected
    if (options.formResponses && Object.keys(options.formResponses).length > 0) {
      const formEmbed = new EmbedBuilder()
        .setTitle("📝 Form Responses")
        .setColor(0x3498db)
        .setTimestamp();

      // Add each form response as a field
      Object.entries(options.formResponses).forEach(([fieldId, value]) => {
        const displayValue = Array.isArray(value) ? value.join(", ") : String(value);
        const fieldLabel =
          options.formMetadata?.[fieldId]?.label ||
          fieldId.charAt(0).toUpperCase() + fieldId.slice(1).replace(/([A-Z])/g, " $1");

        formEmbed.addFields([
          {
            name: fieldLabel,
            value:
              displayValue.length > 1024 ? displayValue.substring(0, 1021) + "..." : displayValue,
            inline: displayValue.length < 50,
          },
        ]);
      });

      // Add category information if available
      if (options.categoryName) {
        formEmbed.setDescription(
          `**Category:** ${options.categoryName}${
            options.ticketNumber ? ` | **Ticket #${options.ticketNumber}**` : ""
          }`
        );
      }

      embeds.push(formEmbed);
    }

    await thread.send({
      content: notificationContent,
      embeds,
      components: createModmailActionButtons(),
    });

    // Create modmail entry in database
    const modmailData: any = {
      guildId: guild.id,
      forumThreadId: thread.id,
      forumChannelId: forumChannel.id,
      userId: targetUser.id,
      userAvatar: targetUser.displayAvatarURL(),
      userDisplayName: memberName,
      lastUserActivityAt: new Date(),
      // Category information - use provided values or defaults
      categoryId: options.categoryId || null,
      categoryName: options.categoryName || null,
      ticketNumber: options.ticketNumber || null,
      priority: (() => {
        // If no priority provided at all, use numeric default
        if (options.priority === undefined || options.priority === null) {
          return TicketPriority.MEDIUM; // This is the number 2
        }

        if (typeof options.priority === "number" && [1, 2, 3, 4].includes(options.priority)) {
          return options.priority;
        }
        if (typeof options.priority === "string") {
          const numPriority = parseInt(options.priority);
          if (!isNaN(numPriority) && [1, 2, 3, 4].includes(numPriority)) {
            return numPriority;
          }
        }
        return TicketPriority.MEDIUM; // This is the number 2
      })(),
      formResponses: options.formResponses
        ? Object.entries(options.formResponses).map(([fieldId, value]) => ({
            fieldId,
            fieldLabel: options.formMetadata?.[fieldId]?.label || fieldId,
            fieldType:
              options.formMetadata?.[fieldId]?.type ||
              (typeof value === "string" ? "short" : "select"),
            value: Array.isArray(value) ? value.join(", ") : String(value),
          }))
        : [],
      createdVia: openedBy?.type === "Staff" ? "command" : "dm",
      // Ensure the thread is marked as open
      isClosed: false,
      closedAt: null,
      closedBy: null,
      closedReason: null,
      // Reset any previous resolution state
      markedResolved: false,
      resolvedAt: null,
      // Reset inactivity tracking
      inactivityNotificationSent: null,
      autoCloseScheduledAt: null,
      autoCloseDisabled: false,
    };

    // If opened by staff, they automatically claim the ticket
    if (openedBy?.type === "Staff") {
      modmailData.claimedBy = openedBy.userId;
      modmailData.claimedAt = new Date();
    }

    // Create new modmail record using Mongoose directly
    // We use direct Mongoose creation since we've already verified no open modmail exists
    const finalModmail = new Modmail(modmailData);
    await finalModmail.save();

    // Debug log the created modmail status
    log.info(
      `Created modmail thread for user ${targetUser.id} with isClosed: ${finalModmail.isClosed}, ID: ${finalModmail._id}`
    );

    // Save the initial message to the database for transcript functionality
    if (initialMessage && initialMessage.trim()) {
      const messageService = new ModmailMessageService();
      const trackingMessageId = `initial-${targetUser.id}-${Date.now()}`;

      try {
        await messageService.addMessage(targetUser.id, {
          messageId: trackingMessageId,
          type: "user",
          content: initialMessage,
          authorId: targetUser.id,
          authorName: targetMember.user.username,
          authorAvatar: targetUser.displayAvatarURL(),
          // Since this is the initial message, it doesn't have Discord message references yet
          discordMessageId: undefined,
          discordMessageUrl: undefined,
          webhookMessageId: undefined,
          webhookMessageUrl: undefined,
          dmMessageId: undefined,
          dmMessageUrl: undefined,
          attachments: [], // Initial message attachments will be handled separately when sent
        });

        log.debug(
          `Saved initial message ${trackingMessageId} to database for user ${targetUser.id}`
        );
      } catch (error) {
        log.error(`Failed to save initial message to database: ${error}`);
        // Don't fail the whole modmail creation if message saving fails
      }
    }

    // Add form responses as system messages if any exist
    if (options.formResponses && Object.keys(options.formResponses).length > 0) {
      const messageService = new ModmailMessageService();

      try {
        // Create a formatted form responses message
        let formResponseContent = "**Form Responses:**\n\n";

        Object.entries(options.formResponses).forEach(([fieldId, value]) => {
          const fieldLabel = options.formMetadata?.[fieldId]?.label || fieldId;
          const displayValue = Array.isArray(value) ? value.join(", ") : String(value);
          formResponseContent += `**${fieldLabel}:** ${displayValue}\n`;
        });

        // Add category information
        if (options.categoryName) {
          formResponseContent = `**Category:** ${options.categoryName}\n\n${formResponseContent}`;
        }

        const formMessageId = `form-responses-${targetUser.id}-${Date.now()}`;

        await messageService.addMessage(targetUser.id, {
          messageId: formMessageId,
          type: "staff",
          content: formResponseContent,
          authorId: client.user.id,
          authorName: "System",
          authorAvatar: client.user.displayAvatarURL(),
          discordMessageId: undefined,
          discordMessageUrl: undefined,
          webhookMessageId: undefined,
          webhookMessageUrl: undefined,
          dmMessageId: undefined,
          dmMessageUrl: undefined,
          attachments: [],
        });

        log.debug(`Saved form responses ${formMessageId} to database for user ${targetUser.id}`);
      } catch (error) {
        log.error(`Failed to save form responses to database: ${error}`);
        // Don't fail the whole modmail creation if message saving fails
      }
    }

    // Handle updating the tag for the thread
    const { handleTag } = require("../events/messageCreate/gotMail");
    if (modmailConfig) {
      await handleTag(finalModmail, modmailConfig, db, thread, forumChannel);
    } else {
      log.error(`Could not update tags: ModmailConfig is null for guild: ${guild.id}`);
    }

    // Clean cache to ensure fresh data on next lookup
    // Clean all cache entries related to this user's modmail
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*userId:${targetUser.id}*`);
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:${targetUser.id}`);
    await db.cleanCache(
      `${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*forumThreadId:${thread.id}*`
    );

    // Send DM to user with close button
    let dmSuccess = false;
    try {
      const dmChannel = await targetUser.createDM();

      // Create close button for the DM
      const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("modmail_close_thread")
          .setLabel("Close Thread")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒")
      );

      await dmChannel.send({
        embeds: [
          openedBy?.type === "Staff"
            ? ModmailEmbeds.staffOpenedThread(client, reason)
            : ModmailEmbeds.threadCreated(client, guild.name),
        ],
        components: [closeButton],
      });
      dmSuccess = true;
    } catch (error) {
      log.warn(`Failed to send DM to user ${targetUser.id}:`, error);
      dmSuccess = false;
    }
    return {
      success: true,
      thread,
      modmail: finalModmail as ModmailType & { _id: any },
      dmSuccess,
    };
  } catch (error) {
    log.error("Error creating modmail thread:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a user has staff permissions for modmail actions
 * Checks both main staff role and category-specific staff roles
 * @param interaction - The Discord interaction
 * @param modmail - The modmail document (optional, for category-specific checks)
 * @returns True if user has staff permissions
 */
export async function hasModmailStaffPermission(interaction: any, modmail?: any): Promise<boolean> {
  // Check main staff role first
  const hasMainStaffRole =
    interaction.member?.roles &&
    typeof interaction.member.roles !== "string" &&
    "cache" in interaction.member.roles
      ? interaction.member.roles.cache.has(env.STAFF_ROLE)
      : false;

  if (hasMainStaffRole) {
    return true;
  }

  // If no modmail context, can't check category-specific roles
  if (!modmail || !modmail.categoryId || !interaction.guild?.id) {
    return false;
  }

  // Check category-specific staff role
  try {
    const categoryManager = new CategoryManager();
    const category = await categoryManager.getCategoryById(
      interaction.guild.id,
      modmail.categoryId
    );

    if (category?.staffRoleId) {
      const hasCategoryStaffRole = interaction.member?.roles?.cache?.has(category.staffRoleId);
      return !!hasCategoryStaffRole;
    }
  } catch (error) {
    log.warn("Failed to check category staff role:", error);
  }

  return false;
}
