/**
 * Support Event Bus - In-memory event system for universal support hooks
 *
 * Enables hooks to listen for standardized events across ticket and modmail systems:
 * - user_interacted: User sent a message or clicked a button
 * - staff_replied: Staff member responded
 * - support_claimed: Support instance was claimed by staff
 * - support_closed: Support instance was closed
 * - support_reopened: Support instance was reopened
 */

import { EventEmitter } from "events";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { SupportInstanceId } from "../models/ScheduledAction.js";

/**
 * Standard support events that hooks can listen to
 */
export enum SupportEventType {
  USER_INTERACTED = "user_interacted",
  STAFF_REPLIED = "staff_replied",
  SUPPORT_CLAIMED = "support_claimed",
  SUPPORT_CLOSED = "support_closed",
  SUPPORT_REOPENED = "support_reopened",
}

// Event payload interfaces
export interface SupportEventPayload {
  supportInstanceId: SupportInstanceId;
  guildId: string;
  userId: string; // Who triggered the event
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface UserInteractedPayload extends SupportEventPayload {
  interactionType: "message" | "button" | "modal";
  channelId: string;
}

export interface StaffRepliedPayload extends SupportEventPayload {
  messageContent?: string;
  channelId: string;
}

export interface SupportClaimedPayload extends SupportEventPayload {
  claimedBy: string;
}

export interface SupportClosedPayload extends SupportEventPayload {
  closedBy: string;
  reason?: string;
}

export interface SupportReopenedPayload extends SupportEventPayload {
  reopenedBy: string;
}

export type SupportEventCallback<T extends SupportEventPayload = SupportEventPayload> = (payload: T) => void | Promise<void>;

/**
 * Centralized event bus for support system events
 *
 * Usage:
 * - Support systems emit events: eventBus.emit('user_interacted', payload)
 * - Hooks listen to events: eventBus.on('user_interacted', callback)
 * - Automatic cleanup when support instances close
 */
export class SupportEventBus {
  private emitter: EventEmitter;
  private listeners: Map<string, Set<SupportEventCallback<SupportEventPayload>>> = new Map();
  private logger: PluginLogger;

  constructor(logger: PluginLogger) {
    this.logger = logger;
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(1000); // Support many hooks listening to events
  }

  /**
   * Emit a support event to all listeners
   */
  emit<T extends SupportEventPayload>(event: SupportEventType, payload: T): void {
    this.logger.debug(`[SupportEventBus] Emitting ${event} for ${payload.supportInstanceId}`);

    // Emit to global listeners
    this.emitter.emit(event, payload);

    // Emit to support-specific listeners
    const supportKey = `${payload.supportInstanceId}:${event}`;
    this.emitter.emit(supportKey, payload);
  }

  /**
   * Listen to all instances of an event type
   */
  on<T extends SupportEventPayload>(event: SupportEventType, callback: SupportEventCallback<T>): void {
    this.emitter.on(event, callback as SupportEventCallback<SupportEventPayload>);

    // Track listener for cleanup
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as SupportEventCallback<SupportEventPayload>);
  }

  /**
   * Listen to events for a specific support instance
   */
  onForSupport<T extends SupportEventPayload>(supportInstanceId: SupportInstanceId, event: SupportEventType, callback: SupportEventCallback<T>): void {
    const supportKey = `${supportInstanceId}:${event}`;
    this.emitter.on(supportKey, callback as SupportEventCallback<SupportEventPayload>);

    // Track listener for cleanup
    if (!this.listeners.has(supportKey)) {
      this.listeners.set(supportKey, new Set());
    }
    this.listeners.get(supportKey)!.add(callback as SupportEventCallback<SupportEventPayload>);
  }

  /**
   * Remove a specific event listener
   */
  off<T extends SupportEventPayload>(event: SupportEventType, callback: SupportEventCallback<T>): void {
    this.emitter.off(event, callback as SupportEventCallback<SupportEventPayload>);
    this.listeners.get(event)?.delete(callback as SupportEventCallback<SupportEventPayload>);
  }

  /**
   * Remove all listeners for a specific support instance
   * Called when support instances are closed to prevent memory leaks
   */
  cleanupSupport(supportInstanceId: SupportInstanceId): void {
    this.logger.debug(`[SupportEventBus] Cleaning up listeners for ${supportInstanceId}`);

    // Remove all support-specific listeners
    for (const [key, listeners] of this.listeners.entries()) {
      if (key.startsWith(`${supportInstanceId}:`)) {
        // Remove all listeners for this support instance
        for (const callback of listeners) {
          this.emitter.off(key, callback);
        }
        this.listeners.delete(key);
      }
    }
  }

  /**
   * Get statistics about current listeners (for debugging)
   */
  getStats(): { totalListeners: number; eventBreakdown: Record<string, number> } {
    const eventBreakdown: Record<string, number> = {};
    let totalListeners = 0;

    for (const [event, listeners] of this.listeners.entries()) {
      eventBreakdown[event] = listeners.size;
      totalListeners += listeners.size;
    }

    return { totalListeners, eventBreakdown };
  }

  /**
   * Convenience method to emit user interaction event
   */
  emitUserInteraction(
    supportInstanceId: SupportInstanceId,
    guildId: string,
    userId: string,
    interactionType: "message" | "button" | "modal",
    channelId: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.emit<UserInteractedPayload>(SupportEventType.USER_INTERACTED, {
      supportInstanceId,
      guildId,
      userId,
      timestamp: new Date(),
      interactionType,
      channelId,
      metadata,
    });
  }

  /**
   * Convenience method to emit staff reply event
   */
  emitStaffReply(supportInstanceId: SupportInstanceId, guildId: string, staffId: string, channelId: string, messageContent?: string, metadata?: Record<string, unknown>): void {
    this.emit<StaffRepliedPayload>(SupportEventType.STAFF_REPLIED, {
      supportInstanceId,
      guildId,
      userId: staffId,
      timestamp: new Date(),
      messageContent,
      channelId,
      metadata,
    });
  }

  /**
   * Convenience method to emit support claimed event
   */
  emitSupportClaimed(supportInstanceId: SupportInstanceId, guildId: string, claimedBy: string, metadata?: Record<string, unknown>): void {
    this.emit<SupportClaimedPayload>(SupportEventType.SUPPORT_CLAIMED, {
      supportInstanceId,
      guildId,
      userId: claimedBy,
      timestamp: new Date(),
      claimedBy,
      metadata,
    });
  }

  /**
   * Convenience method to emit support closed event
   */
  emitSupportClosed(supportInstanceId: SupportInstanceId, guildId: string, closedBy: string, reason?: string, metadata?: Record<string, unknown>): void {
    this.emit<SupportClosedPayload>(SupportEventType.SUPPORT_CLOSED, {
      supportInstanceId,
      guildId,
      userId: closedBy,
      timestamp: new Date(),
      closedBy,
      reason,
      metadata,
    });
  }

  /**
   * Convenience method to emit support reopened event
   */
  emitSupportReopened(supportInstanceId: SupportInstanceId, guildId: string, reopenedBy: string, metadata?: Record<string, unknown>): void {
    this.emit<SupportReopenedPayload>(SupportEventType.SUPPORT_REOPENED, {
      supportInstanceId,
      guildId,
      userId: reopenedBy,
      timestamp: new Date(),
      reopenedBy,
      metadata,
    });
  }
}
