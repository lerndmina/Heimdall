/**
 * ModmailWebSocketService - Real-time event broadcasting for modmail
 *
 * Broadcasts modmail events to connected dashboard clients via Socket.IO.
 * Events are scoped to guild rooms for proper access control.
 */

import type { IModmail } from "../models/Modmail.js";
import type { IModmailConfig } from "../models/ModmailConfig.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("modmail:websocket");

/**
 * Generic Socket.IO-like server interface
 * This allows the service to work with any compatible WebSocket server
 */
export interface WebSocketServer {
  to(room: string): {
    emit(event: string, data: unknown): void;
  };
}

/**
 * WebSocket event payloads
 */
export interface ConversationCreatedPayload {
  type: "conversation_created";
  conversation: {
    id: string;
    ticketNumber: number;
    userId: string;
    userDisplayName: string;
    status: string;
    categoryId?: string;
    categoryName?: string;
    createdVia: string;
    forumThreadId: string;
    createdAt: string;
  };
}

export interface ConversationUpdatedPayload {
  type: "conversation_updated";
  conversation: {
    id: string;
    ticketNumber: number;
    status: string;
    updatedAt: string;
  };
  changes: Record<string, { old: unknown; new: unknown }>;
}

export interface ConversationClosedPayload {
  type: "conversation_closed";
  conversation: {
    id: string;
    ticketNumber: number;
    userId: string;
    userDisplayName: string;
    status: string;
    closedBy: string;
    closedAt?: string;
    closeReason?: string;
  };
  metrics: {
    totalMessages: number;
    duration: number | null;
  };
}

export interface MessagePayload {
  type: "message_received" | "message_sent";
  modmailId: string;
  message: {
    messageId: string;
    authorId: string;
    authorType: string;
    content?: string;
    attachments?: number;
    timestamp: string;
    context?: string;
    isStaffOnly?: boolean;
    deliveredToDm?: boolean;
    deliveredToThread?: boolean;
  };
}

/**
 * ModmailWebSocketService - Real-time event broadcasting
 *
 * TODO: Wire up broadcast calls from ModmailService, ModmailFlowService, and
 * ModmailInteractionService at the appropriate lifecycle points:
 * - onConversationCreated → after successful modmail creation
 * - onConversationUpdated → after claim, priority change, category change
 * - onConversationClosed → after close/auto-close
 * - onAdditionalHelpRequested → after user clicks "I Need More Help"
 * - onMessageReceived → after user DM relay
 * - onMessageSent → after staff reply relay
 * Currently all methods are implemented but no service calls them.
 */
export class ModmailWebSocketService {
  constructor(private io: WebSocketServer) {
    log.info("ModmailWebSocketService initialized");
  }

  /**
   * Broadcast an event to all clients in a guild room
   */
  private broadcastToGuild(guildId: string, event: string, data: unknown): void {
    this.io.to(`guild:${guildId}`).emit(event, data);
  }

  // ========================================
  // CONVERSATION LIFECYCLE EVENTS
  // ========================================

  /**
   * Broadcast modmail conversation created event
   */
  conversationCreated(guildId: string, modmail: IModmail): void {
    const eventData: ConversationCreatedPayload = {
      type: "conversation_created",
      conversation: {
        id: modmail.modmailId,
        ticketNumber: modmail.ticketNumber,
        userId: modmail.userId,
        userDisplayName: modmail.userDisplayName,
        status: modmail.status,
        categoryId: modmail.categoryId ?? undefined,
        categoryName: modmail.categoryName ?? undefined,
        createdVia: modmail.createdVia,
        forumThreadId: modmail.forumThreadId,
        createdAt: modmail.createdAt.toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:conversation_created", eventData);

    log.info("Broadcast modmail conversation created", {
      guildId,
      modmailId: modmail.modmailId,
      ticketNumber: modmail.ticketNumber,
    });
  }

  /**
   * Broadcast modmail conversation updated event
   */
  conversationUpdated(guildId: string, modmail: IModmail, changes: Record<string, { old: unknown; new: unknown }>): void {
    const eventData: ConversationUpdatedPayload = {
      type: "conversation_updated",
      conversation: {
        id: modmail.modmailId,
        ticketNumber: modmail.ticketNumber,
        status: modmail.status,
        updatedAt: modmail.updatedAt.toISOString(),
      },
      changes,
    };

    this.broadcastToGuild(guildId, "modmail:conversation_updated", eventData);

    log.debug("Broadcast modmail conversation updated", {
      guildId,
      modmailId: modmail.modmailId,
      changes: Object.keys(changes),
    });
  }

  /**
   * Broadcast modmail conversation closed event
   */
  conversationClosed(guildId: string, modmail: IModmail, closedBy: string, reason?: string): void {
    const eventData: ConversationClosedPayload = {
      type: "conversation_closed",
      conversation: {
        id: modmail.modmailId,
        ticketNumber: modmail.ticketNumber,
        userId: modmail.userId,
        userDisplayName: modmail.userDisplayName,
        status: modmail.status,
        closedBy,
        closedAt: modmail.closedAt?.toISOString(),
        closeReason: reason,
      },
      metrics: {
        totalMessages: modmail.metrics?.totalMessages || 0,
        duration: modmail.closedAt && modmail.createdAt ? modmail.closedAt.getTime() - modmail.createdAt.getTime() : null,
      },
    };

    this.broadcastToGuild(guildId, "modmail:conversation_closed", eventData);

    log.info("Broadcast modmail conversation closed", {
      guildId,
      modmailId: modmail.modmailId,
      closedBy,
      reason,
    });
  }

  /**
   * Broadcast when user requests additional help (cancels resolve timer)
   */
  additionalHelpRequested(guildId: string, modmail: IModmail): void {
    const eventData = {
      type: "additional_help_requested",
      conversation: {
        id: modmail.modmailId,
        ticketNumber: modmail.ticketNumber,
        userId: modmail.userId,
        userDisplayName: modmail.userDisplayName,
        status: modmail.status,
        requestedAt: modmail.updatedAt.toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:additional_help_requested", eventData);

    log.info("Broadcast modmail additional help requested", {
      guildId,
      modmailId: modmail.modmailId,
    });
  }

  // ========================================
  // MESSAGE EVENTS
  // ========================================

  /**
   * Broadcast modmail message received event (from user)
   */
  messageReceived(
    guildId: string,
    modmailId: string,
    message: {
      messageId: string;
      authorId: string;
      authorType: string;
      content?: string;
      attachments?: { length: number } | unknown[];
      timestamp: Date | string;
      context?: string;
    },
  ): void {
    const eventData: MessagePayload = {
      type: "message_received",
      modmailId,
      message: {
        messageId: message.messageId,
        authorId: message.authorId,
        authorType: message.authorType,
        content: message.content,
        attachments: Array.isArray(message.attachments) ? message.attachments.length : 0,
        timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
        context: message.context,
      },
    };

    this.broadcastToGuild(guildId, "modmail:message_received", eventData);

    log.debug("Broadcast modmail message received", {
      guildId,
      modmailId,
      authorType: message.authorType,
      hasContent: !!message.content,
    });
  }

  /**
   * Broadcast modmail message sent event (from staff)
   */
  messageSent(
    guildId: string,
    modmailId: string,
    message: {
      messageId: string;
      authorId: string;
      authorType: string;
      content?: string;
      isStaffOnly?: boolean;
      deliveredToDm?: boolean;
      deliveredToThread?: boolean;
      timestamp: Date | string;
    },
  ): void {
    const eventData: MessagePayload = {
      type: "message_sent",
      modmailId,
      message: {
        messageId: message.messageId,
        authorId: message.authorId,
        authorType: message.authorType,
        content: message.content,
        isStaffOnly: message.isStaffOnly,
        deliveredToDm: message.deliveredToDm,
        deliveredToThread: message.deliveredToThread,
        timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
      },
    };

    this.broadcastToGuild(guildId, "modmail:message_sent", eventData);

    log.debug("Broadcast modmail message sent", {
      guildId,
      modmailId,
      authorType: message.authorType,
      isStaffOnly: message.isStaffOnly,
    });
  }

  /**
   * Broadcast modmail message delivery failed event
   */
  messageDeliveryFailed(
    guildId: string,
    modmailId: string,
    message: {
      messageId: string;
      authorId: string;
      authorType: string;
      content?: string;
      timestamp: Date | string;
    },
    error: string,
  ): void {
    const eventData = {
      type: "message_delivery_failed",
      modmailId,
      message: {
        messageId: message.messageId,
        authorId: message.authorId,
        authorType: message.authorType,
        content: message.content?.substring(0, 100) || "[No content]",
        timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
      },
      error: {
        message: error,
        timestamp: new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:message_delivery_failed", eventData);

    log.warn("Broadcast modmail message delivery failed", {
      guildId,
      modmailId,
      error,
    });
  }

  // ========================================
  // STAFF EVENTS
  // ========================================

  /**
   * Broadcast modmail conversation claimed event
   */
  conversationClaimed(guildId: string, modmailId: string, ticketNumber: number, claimedBy: string, claimerName?: string): void {
    const eventData = {
      type: "conversation_claimed",
      conversation: {
        id: modmailId,
        ticketNumber,
        claimedBy,
        claimerName,
        claimedAt: new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:conversation_claimed", eventData);

    log.info("Broadcast modmail conversation claimed", {
      guildId,
      modmailId,
      claimedBy,
    });
  }

  /**
   * Broadcast modmail conversation unclaimed event
   */
  conversationUnclaimed(guildId: string, modmailId: string, ticketNumber: number, unclaimedBy: string): void {
    const eventData = {
      type: "conversation_unclaimed",
      conversation: {
        id: modmailId,
        ticketNumber,
        unclaimedBy,
        unclaimedAt: new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:conversation_unclaimed", eventData);

    log.info("Broadcast modmail conversation unclaimed", {
      guildId,
      modmailId,
      unclaimedBy,
    });
  }

  /**
   * Broadcast modmail conversation resolved event
   */
  conversationResolved(guildId: string, modmailId: string, ticketNumber: number, resolvedBy: string, resolverName?: string): void {
    const eventData = {
      type: "conversation_resolved",
      conversation: {
        id: modmailId,
        ticketNumber,
        resolvedBy,
        resolverName,
        resolvedAt: new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:conversation_resolved", eventData);

    log.info("Broadcast modmail conversation resolved", {
      guildId,
      modmailId,
      resolvedBy,
    });
  }

  // ========================================
  // USER EVENTS
  // ========================================

  /**
   * Broadcast modmail user banned event
   */
  userBanned(guildId: string, userId: string, bannedBy: string, bannerName?: string, reason?: string): void {
    const eventData = {
      type: "user_banned",
      user: {
        id: userId,
        bannedBy,
        bannerName,
        reason,
        bannedAt: new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:user_banned", eventData);

    log.info("Broadcast modmail user banned", {
      guildId,
      userId,
      bannedBy,
      reason,
    });
  }

  /**
   * Broadcast modmail user unbanned event
   */
  userUnbanned(guildId: string, userId: string, unbannedBy: string, unbannerName?: string): void {
    const eventData = {
      type: "user_unbanned",
      user: {
        id: userId,
        unbannedBy,
        unbannerName,
        unbannedAt: new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:user_unbanned", eventData);

    log.info("Broadcast modmail user unbanned", {
      guildId,
      userId,
      unbannedBy,
    });
  }

  // ========================================
  // CONFIGURATION EVENTS
  // ========================================

  /**
   * Broadcast modmail configuration updated event
   */
  configurationUpdated(guildId: string, config: IModmailConfig, updatedBy: string, updaterName?: string): void {
    const eventData = {
      type: "configuration_updated",
      configuration: {
        guildId,
        enabled: config.enabled,
        categoriesCount: config.categories.length,
        autoCloseHours: config.autoCloseHours,
        allowAttachments: config.allowAttachments,
        categories: config.categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          forumChannelId: cat.forumChannelId,
          webhookId: cat.webhookId,
        })),
        updatedBy,
        updaterName,
        updatedAt: config.updatedAt?.toISOString() || new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:configuration_updated", eventData);

    log.info("Broadcast modmail configuration updated", {
      guildId,
      updatedBy,
      categoriesCount: config.categories.length,
    });
  }

  /**
   * Broadcast modmail configuration removed event
   */
  configurationRemoved(guildId: string, removedBy: string, removerName?: string): void {
    const eventData = {
      type: "configuration_removed",
      removedBy,
      removerName,
      removedAt: new Date().toISOString(),
    };

    this.broadcastToGuild(guildId, "modmail:configuration_removed", eventData);

    log.info("Broadcast modmail configuration removed", {
      guildId,
      removedBy,
    });
  }

  // ========================================
  // SYSTEM EVENTS
  // ========================================

  /**
   * Broadcast modmail auto-close warning event
   */
  autoCloseWarning(guildId: string, modmailId: string, ticketNumber: number, warningType: "inactivity" | "resolved"): void {
    const eventData = {
      type: "auto_close_warning",
      conversation: {
        id: modmailId,
        ticketNumber,
        warningType,
        warningAt: new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:auto_close_warning", eventData);

    log.info("Broadcast modmail auto-close warning", {
      guildId,
      modmailId,
      warningType,
    });
  }

  /**
   * Broadcast modmail auto-close scheduled event
   */
  autoClosePending(guildId: string, modmailId: string, ticketNumber: number, scheduledAt: Date): void {
    const eventData = {
      type: "auto_close_pending",
      conversation: {
        id: modmailId,
        ticketNumber,
        scheduledAt: scheduledAt.toISOString(),
        timeRemaining: scheduledAt.getTime() - Date.now(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:auto_close_pending", eventData);

    log.info("Broadcast modmail auto-close pending", {
      guildId,
      modmailId,
      scheduledAt: scheduledAt.toISOString(),
    });
  }

  /**
   * Broadcast modmail statistics updated event (for dashboard charts)
   */
  statisticsUpdated(
    guildId: string,
    stats: {
      total: number;
      open: number;
      resolved: number;
      closed: number;
      recent?: { last24Hours: number };
    },
  ): void {
    const eventData = {
      type: "statistics_updated",
      stats: {
        total: stats.total,
        open: stats.open,
        resolved: stats.resolved,
        closed: stats.closed,
        last24Hours: stats.recent?.last24Hours || 0,
        updatedAt: new Date().toISOString(),
      },
    };

    this.broadcastToGuild(guildId, "modmail:statistics_updated", eventData);

    log.debug("Broadcast modmail statistics updated", {
      guildId,
      totalConversations: stats.total,
    });
  }
}
