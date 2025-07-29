import type { LoadedEvent, LegacyEventData, ModernEventData } from "../types";
import { discoverFiles, safeImport } from "../utils/fileUtils";
import { pathToEventName } from "../utils/pathUtils";

export class EventLoader {
  /**
   * Loads all events from the specified directory
   */
  async loadFromDirectory(eventsPath: string): Promise<Map<string, LoadedEvent[]>> {
    const events = new Map<string, LoadedEvent[]>();
    
    console.log(`Loading events from: ${eventsPath}`);
    
    // Discover all event files recursively
    const files = await discoverFiles(eventsPath, ['.ts', '.js']);
    console.log(`Found ${files.length} potential event files`);
    
    for (const file of files) {
      try {
        const event = await this.loadEvent(file, eventsPath);
        if (event) {
          const eventName = event.name;
          
          if (!events.has(eventName)) {
            events.set(eventName, []);
          }
          
          events.get(eventName)!.push(event);
          console.log(`Loaded event: ${eventName} from ${file} (${event.isLegacy ? 'legacy' : 'modern'})`);
        }
      } catch (error) {
        console.error(`Failed to load event from ${file}:`, error);
      }
    }
    
    const totalEvents = Array.from(events.values()).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`Successfully loaded ${totalEvents} events across ${events.size} event types`);
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
      console.warn(`Invalid event export pattern in ${filePath}`);
      return null;
    }
  }
  
  /**
   * Checks if exports match legacy pattern (default export function)
   */
  private isLegacyPattern(exports: any): exports is LegacyEventData {
    return typeof exports.default === 'function';
  }
  
  /**
   * Checks if exports match modern pattern
   */
  private isModernPattern(exports: any): exports is ModernEventData {
    return exports.event && typeof exports.execute === 'function';
  }
  
  /**
   * Adapts legacy event to internal format
   */
  private adaptLegacyEvent(
    exports: LegacyEventData, 
    filePath: string, 
    eventName: string
  ): LoadedEvent {
    return {
      name: eventName,
      filePath,
      isLegacy: true,
      once: false, // Legacy events are always recurring
      execute: async (client, handler, ...args) => {
        // Legacy events receive (client, ...args) - pass handler as second param
        await exports.default(client, handler, ...args);
      }
    };
  }
  
  /**
   * Adapts modern event to internal format
   */
  private adaptModernEvent(
    exports: ModernEventData, 
    filePath: string, 
    eventName: string
  ): LoadedEvent {
    return {
      name: exports.event,
      filePath,
      isLegacy: false,
      once: exports.once ?? false,
      execute: async (client, handler, ...args) => {
        await exports.execute(client, handler, ...args);
      }
    };
  }
}
