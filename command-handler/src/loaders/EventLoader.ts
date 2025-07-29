import type { LoadedEvent, LegacyEventData, ModernEventData } from "../types";
import { discoverFiles, safeImport } from "../utils/fileUtils";
import { pathToEventName } from "../utils/pathUtils";
import { createLogger, LogLevel } from "@heimdall/logger";

export class EventLoader {
  private logger = createLogger("command-handler", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  /**
   * Loads all events from the specified directory
   */
  async loadFromDirectory(eventsPath: string): Promise<Map<string, LoadedEvent[]>> {
    const events = new Map<string, LoadedEvent[]>();

    this.logger.debug(`Loading events from: ${eventsPath}`);

    // Discover all event files recursively
    const files = await discoverFiles(eventsPath, [".ts", ".js"]);
    this.logger.debug(`Found ${files.length} potential event files`);

    for (const file of files) {
      try {
        const event = await this.loadEvent(file, eventsPath);
        if (event) {
          const eventName = event.name;

          if (!events.has(eventName)) {
            events.set(eventName, []);
          }

          events.get(eventName)!.push(event);
          this.logger.debug(`Loaded event: ${eventName} from ${file} (${event.isLegacy ? "legacy" : "modern"})`);
        }
      } catch (error) {
        this.logger.error(`Failed to load event from ${file}:`, error);
      }
    }

    const totalEvents = Array.from(events.values()).reduce((sum, arr) => sum + arr.length, 0);
    this.logger.debug(`Successfully loaded ${totalEvents} events across ${events.size} event types`);
    return events;
  }

  /**
   * Loads a single event file
   */
  private async loadEvent(filePath: string, basePath: string): Promise<LoadedEvent | null> {
    const exports = await safeImport(filePath);
    if (!exports) {
      return null;
    }

    const eventName = pathToEventName(filePath, basePath);

    // Detect export pattern
    if (this.isLegacyPattern(exports)) {
      return this.adaptLegacyEvent(exports, filePath, eventName);
    } else if (this.isModernPattern(exports)) {
      return this.adaptModernEvent(exports, filePath, eventName);
    } else {
      this.logger.warn(`Invalid event export pattern in ${filePath}`);
      return null;
    }
  }

  /**
   * Checks if exports match legacy pattern (default export function)
   */
  private isLegacyPattern(exports: any): exports is LegacyEventData {
    return typeof exports.default === "function";
  }

  /**
   * Checks if exports match modern pattern
   */
  private isModernPattern(exports: any): exports is ModernEventData {
    return exports.event && typeof exports.execute === "function";
  }

  /**
   * Adapts legacy event to internal format
   */
  private adaptLegacyEvent(exports: LegacyEventData, filePath: string, eventName: string): LoadedEvent {
    return {
      name: eventName,
      filePath,
      isLegacy: true,
      once: false, // Legacy events are always recurring
      execute: async (client, handler, ...args) => {
        // Existing event format: (discordEventArgs, ourClient, ourHandler)
        // So for ready: (handler) since ready has no Discord args
        // For messageCreate: (message, client, handler)
        // For interactionCreate: (interaction, client, handler)
        if (eventName === "ready") {
          // Ready event has no Discord args, so just pass client and handler
          (exports.default as any)(client, handler);
        } else {
          // Other events: pass Discord args first, then client, then handler
          (exports.default as any)(...args, client, handler);
        }
      },
    };
  }

  /**
   * Adapts modern event to internal format
   */
  private adaptModernEvent(exports: ModernEventData, filePath: string, eventName: string): LoadedEvent {
    return {
      name: exports.event,
      filePath,
      isLegacy: false,
      once: exports.once ?? false,
      execute: async (client, handler, ...args) => {
        await exports.execute(client, handler, ...args);
      },
    };
  }
}
