/**
 * ComponentCallbackService - Unified component handling system
 *
 * Handles both ephemeral and persistent components:
 * - **Ephemeral (with TTL)**: Inline callbacks stored in Redis, auto-expire
 * - **Persistent (no TTL)**: Named handlers stored in MongoDB, survive restarts
 */

import type { ButtonInteraction, AnySelectMenuInteraction } from "discord.js";
import { nanoid } from "nanoid";
import type { RedisClientType } from "redis";
import log from "../../utils/logger";
import { PersistentComponent } from "../models";

export type ComponentInteraction = ButtonInteraction | AnySelectMenuInteraction;
export type ComponentCallback = (interaction: ComponentInteraction) => Promise<void>;

interface StoredCallback {
  callback: ComponentCallback;
  ttl?: number;
}

export interface ComponentStats {
  ephemeralCallbacks: number;
  persistentHandlers: number;
  persistentComponents: number;
  loaded: boolean;
}

export class ComponentCallbackService {
  private redis: RedisClientType;
  private nanoidLength: number;

  // Ephemeral callbacks (with TTL, stored in memory + Redis marker)
  private callbacks: Map<string, StoredCallback> = new Map();

  // Persistent handler registry (named handlers, registered at startup)
  private persistentHandlers: Map<string, ComponentCallback> = new Map();

  // Persistent component mapping (customId -> handlerId, loaded from MongoDB)
  private persistentComponents: Map<string, string> = new Map();

  private loaded = false;

  constructor(redis: RedisClientType, nanoidLength: number = 12) {
    this.redis = redis;
    this.nanoidLength = nanoidLength;
  }

  /**
   * Register a callback for a component
   * @param callback - The function to call when interaction received
   * @param ttl - TTL in seconds (required for ephemeral components)
   * @returns The custom ID (nanoid) to use for the component
   */
  async register(callback: ComponentCallback, ttl: number = 300): Promise<string> {
    const customId = nanoid(this.nanoidLength);

    log.debug(`[ComponentCallbackService] register() called with TTL: ${ttl}, customId: ${customId}`);

    // Store in memory with TTL tracking
    this.callbacks.set(customId, { callback, ttl });

    // Store a marker in Redis so we know this component exists
    await this.redis.setEx(`component:${customId}`, ttl, "1");

    // Auto-cleanup from memory after TTL
    setTimeout(() => {
      this.callbacks.delete(customId);
    }, ttl * 1000);

    log.debug(`[ComponentCallbackService] Registered ephemeral component: ${customId} (TTL: ${ttl}s)`);

    return customId;
  }

  /**
   * Register a persistent handler (named handler that survives restarts)
   * @param handlerId - Unique ID for this handler
   * @param callback - The function to call when interaction received
   */
  registerPersistentHandler(handlerId: string, callback: ComponentCallback): void {
    if (this.persistentHandlers.has(handlerId)) {
      log.warn(`[ComponentCallbackService] Handler "${handlerId}" already registered, overwriting`);
    }

    this.persistentHandlers.set(handlerId, callback);
    log.debug(`[ComponentCallbackService] Registered persistent handler: ${handlerId}`);
  }

  /**
   * Create a persistent component linked to a registered handler
   * @param handlerId - The handler ID to link this component to
   * @param componentType - Type of component (button or selectMenu)
   * @param metadata - Optional metadata to store with the component
   * @returns The customId to use for the component
   */
  async createPersistentComponent(handlerId: string, componentType: "button" | "selectMenu" = "button", metadata?: Record<string, unknown>): Promise<string> {
    const customId = nanoid(this.nanoidLength);

    // Verify handler is registered
    if (!this.persistentHandlers.has(handlerId)) {
      log.warn(`[ComponentCallbackService] Handler "${handlerId}" not registered, component may not work after restart`);
    }

    // Save to MongoDB
    await PersistentComponent.create({
      customId,
      handlerId,
      componentType,
      metadata,
    });

    // Add to memory map
    this.persistentComponents.set(customId, handlerId);

    log.debug(`[ComponentCallbackService] Created persistent component: ${customId} -> ${handlerId}`);

    return customId;
  }

  /**
   * Load all persistent components from MongoDB on startup
   * This rebuilds the customId -> handlerId mapping in memory
   */
  async loadPersistentComponents(): Promise<void> {
    if (this.loaded) {
      log.warn("[ComponentCallbackService] Persistent components already loaded");
      return;
    }

    try {
      const components = await PersistentComponent.find({});

      this.persistentComponents.clear();

      for (const component of components) {
        this.persistentComponents.set(component.customId, component.handlerId);
      }

      this.loaded = true;

      log.debug(`[ComponentCallbackService] Loaded ${components.length} persistent components from MongoDB`);
    } catch (error) {
      log.error("[ComponentCallbackService] Failed to load persistent components:", error);
      throw error;
    }
  }

  /**
   * Execute a component callback
   * @param interaction - The interaction to handle
   * @returns true if handled, false if no callback found
   */
  async execute(interaction: ComponentInteraction): Promise<boolean> {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id || "DM";
    const componentType = interaction.isButton() ? "button" : "selectMenu";
    const startTime = Date.now();

    log.debug(`[ComponentCallbackService] Executing ${componentType} interaction: ${customId} (user: ${userId}, guild: ${guildId})`);

    // 1. Check ephemeral callbacks first (TTL-based, in-memory)
    const stored = this.callbacks.get(customId);

    if (stored) {
      const executionTime = Date.now() - startTime;
      log.debug(`[ComponentCallbackService] 🔄 Executing ephemeral ${componentType}: ${customId} (user: ${userId}, guild: ${guildId}, time: ${executionTime}ms)`);

      try {
        await stored.callback(interaction);
        const totalTime = Date.now() - startTime;
        log.debug(`[ComponentCallbackService] ✅ Ephemeral ${componentType} completed: ${customId} (time: ${totalTime}ms)`);
        return true;
      } catch (error) {
        const totalTime = Date.now() - startTime;
        log.error(`[ComponentCallbackService] ❌ Ephemeral ${componentType} failed: ${customId} (user: ${userId}, time: ${totalTime}ms)`, error);

        // Try to respond to user
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content: "❌ An error occurred while processing this interaction.",
              ephemeral: true,
            })
            .catch(() => {});
        }

        return true; // Still return true since we found and attempted the callback
      }
    }

    // 2. Check persistent components (MongoDB-backed, survive restarts)
    let handlerId = this.persistentComponents.get(customId);

    // 2b. Fallback: check MongoDB directly (component may have been created after initial load)
    if (!handlerId) {
      try {
        const dbComponent = await PersistentComponent.findOne({ customId }).lean();
        if (dbComponent) {
          handlerId = dbComponent.handlerId;
          // Cache for future lookups
          this.persistentComponents.set(customId, handlerId);
          log.debug(`[ComponentCallbackService] Late-loaded persistent component from DB: ${customId} -> ${handlerId}`);
        }
      } catch {
        // DB lookup failed, continue to other fallbacks
      }
    }

    // 2c. Direct Handler Fallback - allows using handler ID directly as customId
    if (!handlerId && this.persistentHandlers.has(customId)) {
      handlerId = customId;
    }

    if (handlerId) {
      let handler = this.persistentHandlers.get(handlerId);

      // Global Wrapper Fallback (for _w handler persistence)
      if (!handler && handlerId.endsWith("_w")) {
        const originalId = handlerId.slice(0, -2);
        const originalHandler = this.persistentHandlers.get(originalId);

        if (originalHandler) {
          log.debug(`[ComponentCallbackService] 🔄 Synthesizing wrapper for ${handlerId} -> ${originalId}`);
          handler = async (i) => {
            if (i.isAnySelectMenu() && i.values?.includes("heimdall_deselect_menu")) {
              await i.deferUpdate();
              return;
            }
            await originalHandler(i);
          };
        }
      }

      const executionTime = Date.now() - startTime;

      if (!handler) {
        log.error(`[ComponentCallbackService] ❌ Persistent ${componentType} mapping broken: ${customId} -> "${handlerId}" (handler not registered, user: ${userId}, guild: ${guildId})`);

        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content: "❌ This component's handler is not available. The bot may need to restart.",
              ephemeral: true,
            })
            .catch(() => {});
        }

        return true;
      }

      log.debug(`[ComponentCallbackService] 🔄 Executing persistent ${componentType}: ${customId} -> "${handlerId}" (user: ${userId}, guild: ${guildId}, time: ${executionTime}ms)`);

      try {
        await handler(interaction);
        const totalTime = Date.now() - startTime;
        log.debug(`[ComponentCallbackService] ✅ Persistent ${componentType} completed: ${customId} -> "${handlerId}" (time: ${totalTime}ms)`);
        return true;
      } catch (error) {
        const totalTime = Date.now() - startTime;
        log.error(`[ComponentCallbackService] ❌ Persistent ${componentType} failed: ${customId} -> "${handlerId}" (user: ${userId}, time: ${totalTime}ms)`, error);

        // Try to respond to user
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content: "❌ An error occurred while processing this interaction.",
              ephemeral: true,
            })
            .catch(() => {});
        }

        return true;
      }
    }

    // Not found in either map — expired ephemeral or unknown component
    const executionTime = Date.now() - startTime;
    log.warn(`[ComponentCallbackService] ⚠️ Unhandled ${componentType}: ${customId} (user: ${userId}, guild: ${guildId}, time: ${executionTime}ms)`);

    if (!interaction.replied && !interaction.deferred) {
      if (interaction.guild) {
        // In a guild: don't destroy the original message — reply ephemerally
        await interaction
          .reply({
            content: "⏳ This button or menu has expired. Please try again.",
            ephemeral: true,
          })
          .catch(() => {});
      } else {
        // In DMs: safe to replace the message (removes dead buttons)
        await interaction
          .update({
            content: "⏳ This button or menu has expired. Please start again.",
            embeds: [],
            components: [],
          })
          .catch(() => {});
      }
    }

    return false;
  }

  /**
   * Remove an ephemeral callback (cleanup)
   */
  async unregister(customId: string): Promise<void> {
    this.callbacks.delete(customId);
    await this.redis.del(`component:${customId}`);
  }

  /**
   * Delete a persistent component (removes from MongoDB and memory)
   */
  async deletePersistentComponent(customId: string): Promise<void> {
    await PersistentComponent.deleteOne({ customId });
    this.persistentComponents.delete(customId);
    log.debug(`[ComponentCallbackService] Deleted persistent component: ${customId}`);
  }

  /**
   * Get metadata for a persistent component
   */
  async getPersistentComponentMetadata(customId: string): Promise<Record<string, unknown> | null> {
    try {
      const component = await PersistentComponent.findOne({ customId });
      return (component?.metadata as Record<string, unknown>) || null;
    } catch (error) {
      log.error(`[ComponentCallbackService] Failed to get metadata for ${customId}:`, error);
      return null;
    }
  }

  /**
   * Add a persistent component to the in-memory cache
   * Used when components are created after initial load
   */
  addPersistentComponentToCache(customId: string, handlerId: string): void {
    this.persistentComponents.set(customId, handlerId);
    log.debug(`[ComponentCallbackService] Added persistent component to cache: ${customId} -> ${handlerId}`);
  }

  /**
   * Update persistent component with message context for cleanup tracking
   */
  async updateComponentMessageContext(customId: string, messageId: string, channelId: string, guildId?: string): Promise<void> {
    try {
      await PersistentComponent.findOneAndUpdate(
        { customId },
        {
          messageId,
          channelId,
          guildId: guildId || null,
        },
      );

      log.debug(`[ComponentCallbackService] Updated component context: ${customId} -> message ${messageId} in channel ${channelId}`);
    } catch (error) {
      log.error(`[ComponentCallbackService] Failed to update component context for ${customId}:`, error);
    }
  }

  /**
   * Clean up persistent components by message ID
   */
  async cleanupByMessageId(messageId: string): Promise<number> {
    try {
      const components = await PersistentComponent.find({ messageId });

      let removedFromCache = 0;
      for (const component of components) {
        if (this.persistentComponents.has(component.customId)) {
          this.persistentComponents.delete(component.customId);
          removedFromCache++;
        }
      }

      const result = await PersistentComponent.deleteMany({ messageId });

      log.debug(`[ComponentCallbackService] Cleaned up ${result.deletedCount} persistent components for message ${messageId} (${removedFromCache} from cache)`);

      return result.deletedCount;
    } catch (error) {
      log.error(`[ComponentCallbackService] Failed to cleanup components for message ${messageId}:`, error);
      return 0;
    }
  }

  /**
   * Get stats for debugging
   */
  getStats(): ComponentStats {
    return {
      ephemeralCallbacks: this.callbacks.size,
      persistentHandlers: this.persistentHandlers.size,
      persistentComponents: this.persistentComponents.size,
      loaded: this.loaded,
    };
  }
}
