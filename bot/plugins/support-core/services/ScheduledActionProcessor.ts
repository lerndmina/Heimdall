/**
 * ScheduledActionProcessor - Processes due scheduled actions on interval
 *
 * Runs every 60 seconds by default and processes actions that are due for execution.
 * Uses SupportEventBus to emit action events.
 */

import type { PluginLogger } from "../../../src/types/Plugin.js";
import ScheduledAction, { type SupportInstanceId } from "../models/ScheduledAction.js";
import { SupportEventBus, type SupportEventPayload, SupportEventType } from "./SupportEventBus.js";

export class ScheduledActionProcessor {
  private interval: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly eventBus: SupportEventBus,
    private readonly logger: PluginLogger,
    private readonly processIntervalMs = 60_000, // 1 minute
  ) {}

  /**
   * Start the processor
   */
  start(): void {
    if (this.interval) {
      this.logger.warn("ScheduledActionProcessor already running");
      return;
    }

    this.interval = setInterval(() => this.processActions(), this.processIntervalMs);
    this.logger.info("ScheduledActionProcessor started");

    // Process immediately on start
    this.processActions();
  }

  /**
   * Stop the processor
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.logger.info("ScheduledActionProcessor stopped");
  }

  /**
   * Process all due actions
   */
  private async processActions(): Promise<void> {
    // Prevent concurrent processing
    if (this.processing) {
      this.logger.debug("ScheduledActionProcessor already processing, skipping");
      return;
    }

    this.processing = true;

    try {
      const dueActions = await ScheduledAction.findDueActions(100);

      if (dueActions.length > 0) {
        this.logger.debug(`Processing ${dueActions.length} scheduled actions`);
      }

      for (const action of dueActions) {
        try {
          // Create the event payload
          const payload: SupportEventPayload = {
            supportInstanceId: action.supportInstanceId as SupportInstanceId,
            guildId: action.guildId,
            userId: "system",
            timestamp: new Date(),
            metadata: {
              actionId: action.actionId,
              hookId: action.hookId,
              ...((action.payload as Record<string, unknown>) || {}),
            },
          };

          // Emit event for the action
          // The action type maps to a SupportEventType or is a custom action
          const eventType = this.mapActionToEventType(action.action);
          if (eventType) {
            this.eventBus.emit(eventType, payload);
          } else {
            // For custom actions, emit with action name as event type
            this.logger.debug(`Emitting custom action event: ${action.action}`);
            // Custom actions can be handled by hooks that register for them
          }

          // Mark as processed
          await ScheduledAction.updateOne({ _id: action._id }, { processed: true, processedAt: new Date() });

          this.logger.debug(`Processed scheduled action ${action.actionId}`);
        } catch (error) {
          // Increment retry count
          await ScheduledAction.updateOne(
            { _id: action._id },
            {
              $inc: { retryCount: 1 },
              error: String(error),
            },
          );
          this.logger.error(`Failed to process action ${action.actionId}:`, error);
        }
      }
    } catch (error) {
      this.logger.error("ScheduledActionProcessor error:", error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Map action string to SupportEventType if applicable
   */
  private mapActionToEventType(action: string): SupportEventType | null {
    const mapping: Record<string, SupportEventType> = {
      user_interacted: SupportEventType.USER_INTERACTED,
      staff_replied: SupportEventType.STAFF_REPLIED,
      support_claimed: SupportEventType.SUPPORT_CLAIMED,
      support_closed: SupportEventType.SUPPORT_CLOSED,
      support_reopened: SupportEventType.SUPPORT_REOPENED,
    };

    return mapping[action] || null;
  }
}
