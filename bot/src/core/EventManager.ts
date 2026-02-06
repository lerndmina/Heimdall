/**
 * EventManager - Collects events from plugins and attaches to client
 *
 * Handles:
 * - Event collection from plugins
 * - Event attachment to Discord client
 */

import type { ClientEvents } from "discord.js";
import type { HeimdallClient } from "../types/Client";
import log from "../utils/logger";

export interface PluginEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  /** Discord.js event name */
  event: K;
  /** Only fire once */
  once?: boolean;
  /** Which plugin owns this event */
  pluginName: string;
  /** Event handler function */
  execute: (client: HeimdallClient, ...args: ClientEvents[K]) => Promise<void>;
}

export class EventManager {
  private client: HeimdallClient;
  private events: PluginEvent[] = [];

  constructor(client: HeimdallClient) {
    this.client = client;
  }

  /**
   * Register an event from a plugin
   */
  registerEvent<K extends keyof ClientEvents>(event: PluginEvent<K>): void {
    // Use unknown as intermediate type to avoid TypeScript's strict type comparison
    this.events.push(event as unknown as PluginEvent);
    log.debug(`Registered event: ${String(event.event)} (plugin: ${event.pluginName})`);
  }

  /**
   * Attach all registered events to the Discord client
   */
  attachEvents(): void {
    for (const event of this.events) {
      const handler = async (...args: unknown[]) => {
        try {
          await event.execute(this.client, ...(args as ClientEvents[keyof ClientEvents]));
        } catch (error) {
          log.error(`Event handler error (${String(event.event)} from ${event.pluginName}):`, error);
        }
      };

      if (event.once) {
        this.client.once(event.event, handler);
      } else {
        this.client.on(event.event, handler);
      }
    }

    log.info(`Attached ${this.events.length} event handler(s)`);
  }

  /**
   * Get registered event count
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get stats about registered events
   */
  getStats(): { total: number; byPlugin: Record<string, number> } {
    const byPlugin: Record<string, number> = {};

    for (const event of this.events) {
      byPlugin[event.pluginName] = (byPlugin[event.pluginName] || 0) + 1;
    }

    return {
      total: this.events.length,
      byPlugin,
    };
  }
}
