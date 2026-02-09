/**
 * TicketCreator - Creates ticket channels and sends welcome messages
 */

import { ChannelType, Guild, PermissionFlagsBits, TextChannel, OverwriteType } from "discord.js";
import { nanoid } from "nanoid";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import Ticket, { type ITicket } from "../models/Ticket.js";
import TicketCategory, { type ITicketCategory } from "../models/TicketCategory.js";
import { TicketSessionService } from "../services/TicketSessionService.js";
import { TicketLifecycleService } from "../services/TicketLifecycleService.js";
import { buildControlPanel } from "./TicketControlPanel.js";
import { TicketStatus } from "../types/index.js";

// Discord category channel limit
const DISCORD_CATEGORY_CHANNEL_LIMIT = 50;

interface CreateChannelResult {
  success: boolean;
  channel?: TextChannel;
  error?: "CATEGORY_FULL" | "INVALID_CATEGORY" | "CREATION_FAILED";
  message?: string;
}

/**
 * Create ticket channel with proper permissions
 */
export async function createTicketChannel(
  client: HeimdallClient,
  lib: LibAPI,
  lifecycleService: TicketLifecycleService,
  guild: Guild,
  category: ITicketCategory,
  userId: string,
  ticketNumber: number,
  logger: PluginLogger,
): Promise<CreateChannelResult> {
  try {
    // Get user display name
    const user = await lib.thingGetter.getUser(userId);
    const userDisplayName = user ? lib.thingGetter.getUsername(user) : "Unknown User";

    // Validate discordCategoryId
    if (!category.discordCategoryId) {
      logger.warn(`Category ${category.id} has no discordCategoryId`);
      return {
        success: false,
        error: "INVALID_CATEGORY",
        message: "The ticket category is misconfigured.",
      };
    }

    // Get Discord category channel
    const discordCategory = await lib.thingGetter.getChannel(category.discordCategoryId);
    if (!discordCategory || discordCategory.type !== ChannelType.GuildCategory) {
      logger.warn(`Invalid category channel: ${category.discordCategoryId}`);
      return {
        success: false,
        error: "INVALID_CATEGORY",
        message: "The ticket category is misconfigured.",
      };
    }

    // Check channel limit
    const channelsInCategory = guild.channels.cache.filter((ch) => ch.parentId === category.discordCategoryId);
    if (channelsInCategory.size >= DISCORD_CATEGORY_CHANNEL_LIMIT) {
      logger.warn(`Category ${category.name} is full`);
      return {
        success: false,
        error: "CATEGORY_FULL",
        message: "This ticket category is currently full.",
      };
    }

    // Generate channel name
    const channelName = lifecycleService.generateTicketName(category.ticketNameFormat, ticketNumber, userDisplayName, null, category.name);

    // Build permission overwrites
    const permissionOverwrites: {
      id: string;
      type: OverwriteType;
      allow?: bigint[];
      deny?: bigint[];
    }[] = [
      {
        id: guild.id,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: userId,
        type: OverwriteType.Member,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ];

    for (const staffRole of category.staffRoles) {
      permissionOverwrites.push({
        id: staffRole.roleId,
        type: OverwriteType.Role,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
      });
    }

    // Create channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.discordCategoryId,
      permissionOverwrites,
    });

    logger.info(`Created ticket channel ${channel.id} for user ${userId}`);
    return { success: true, channel };
  } catch (error) {
    logger.error("Error creating ticket channel:", error);
    return {
      success: false,
      error: "CREATION_FAILED",
      message: "Failed to create ticket channel.",
    };
  }
}

/**
 * Send welcome message in ticket channel
 */
export async function sendTicketWelcomeMessage(lib: LibAPI, channel: TextChannel, ticket: ITicket, category: ITicketCategory): Promise<void> {
  // Build staff role pings
  const staffPings = category.staffRoles
    .filter((role) => role.shouldPing)
    .map((role) => `<@&${role.roleId}>`)
    .join(" ");

  // Build embed
  const embed = lib
    .createEmbedBuilder()
    .setTitle(`Ticket #${ticket.ticketNumber}`)
    .setDescription(`Thank you for opening a ticket, <@${ticket.userId}>. A staff member will be with you shortly.`)
    .setColor(0x5865f2)
    .setTimestamp();

  // Add question responses
  if (ticket.questionResponses && ticket.questionResponses.length > 0) {
    for (const response of ticket.questionResponses) {
      embed.addFields({
        name: response.questionLabel,
        value: response.answer || "*No response*",
        inline: false,
      });
    }
  }

  // Build control panel
  const controlRows = await buildControlPanel(lib, ticket, category);

  await channel.send({
    content: staffPings || undefined,
    embeds: [embed],
    components: controlRows as any,
  });
}

/**
 * Create ticket from session (complete flow)
 */
export async function createTicketFromSession(
  client: HeimdallClient,
  lib: LibAPI,
  sessionService: TicketSessionService,
  lifecycleService: TicketLifecycleService,
  sessionId: string,
  logger: PluginLogger,
): Promise<{ success: boolean; message: string; ticket?: ITicket }> {
  const session = await sessionService.getSession(sessionId);
  if (!session) {
    return { success: false, message: "Session expired. Please try again." };
  }

  const category = await TicketCategory.findOne({ id: session.categoryId });
  if (!category) {
    await sessionService.deleteSession(sessionId);
    return { success: false, message: "Category not found." };
  }

  const guild = await lib.thingGetter.getGuild(session.guildId);
  if (!guild) {
    await sessionService.deleteSession(sessionId);
    return { success: false, message: "Guild not found." };
  }

  // Get user display name
  const user = await lib.thingGetter.getUser(session.subjectId);
  const userDisplayName = user ? lib.thingGetter.getUsername(user) : "Unknown User";

  // Get next ticket number
  const ticketNumber = await lifecycleService.getNextTicketNumber(session.guildId);

  // Create channel
  const channelResult = await createTicketChannel(client, lib, lifecycleService, guild, category, session.subjectId, ticketNumber, logger);

  if (!channelResult.success || !channelResult.channel) {
    await sessionService.deleteSession(sessionId);
    return {
      success: false,
      message: channelResult.message || "Failed to create channel.",
    };
  }

  // Build question responses from session
  const questionResponses: {
    questionId: string;
    questionLabel: string;
    questionType: "select" | "modal";
    answer: string;
  }[] = [];

  // Add select question answers
  for (const [questionId, value] of Object.entries(session.selectAnswers)) {
    const question = category.selectQuestions?.find((q) => q.id === questionId);
    if (question) {
      const option = question.options.find((o) => o.value === value);
      questionResponses.push({
        questionId,
        questionLabel: question.label,
        questionType: "select",
        answer: option?.label || value,
      });
    }
  }

  // Add modal question answers
  for (const [questionId, value] of Object.entries(session.modalAnswers)) {
    const question = category.modalQuestions?.find((q) => q.id === questionId);
    if (question) {
      questionResponses.push({
        questionId,
        questionLabel: question.label,
        questionType: "modal",
        answer: value,
      });
    }
  }

  // Create ticket document
  const ticket = new Ticket({
    id: nanoid(),
    guildId: session.guildId,
    channelId: channelResult.channel.id,
    ticketNumber,
    categoryId: session.categoryId,
    categoryName: category.name,
    userId: session.subjectId,
    userDisplayName,
    openedBy: session.openerId,
    status: TicketStatus.OPEN,
    questionResponses,
    openReason: session.openReason,
    lastActivityAt: new Date(),
  });

  await ticket.save();

  // Send welcome message with control panel
  await sendTicketWelcomeMessage(lib, channelResult.channel, ticket, category);

  // Clean up session
  await sessionService.deleteSession(sessionId);

  logger.info(`Created ticket #${ticketNumber} in channel ${channelResult.channel.id}`);

  broadcastDashboardChange(session.guildId, "tickets", "ticket_created", {
    requiredAction: "tickets.manage_tickets",
  });

  return { success: true, message: "Ticket created successfully.", ticket };
}
