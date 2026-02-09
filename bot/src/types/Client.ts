/**
 * HeimdallClient Interface for Heimdall v1
 * Extended by plugins via declaration merging
 */

import type { Client } from "discord.js";
import type { RedisClientType } from "redis";
import type { Connection } from "mongoose";
import type { WebSocketManager } from "../core/WebSocketManager.js";

/**
 * Core HeimdallClient - Extended by plugins via declaration merging
 * Plugins can augment this interface to add their services
 *
 * @example
 * // In a plugin's types file:
 * declare module "@/types/Client" {
 *   interface HeimdallClient {
 *     myService: MyServiceType;
 *   }
 * }
 */
export interface HeimdallClient extends Client<true> {
  /** Redis client for caching and pub/sub */
  redis: RedisClientType;

  /** Mongoose connection instance */
  mongoConnection: Connection;

  /** WebSocket manager for dashboard live updates */
  wsManager: WebSocketManager;

  /**
   * Plugin APIs registered by loaded plugins
   * Access via: client.plugins.get("pluginName")
   */
  plugins: Map<string, unknown>;
}

/**
 * Type guard to check if client is a ready HeimdallClient
 * @param client - Discord.js client instance
 * @returns True if client is ready and has Heimdall extensions
 */
export function isHeimdallClient(client: Client): client is HeimdallClient {
  return client.isReady() && "redis" in client && "plugins" in client;
}
