/**
 * Shared utility for getting the modmail plugin API from the client.
 *
 * Uses a module-level cache that resets on hot-reload (module re-evaluation).
 * Safe as a singleton: the plugin API object reference doesn't change after initial load.
 */

import type { HeimdallClient } from "../../../src/types/Client.js";
import type { ModmailPluginAPI } from "../index.js";

let cachedPluginAPI: ModmailPluginAPI | null = null;

/**
 * Get the modmail plugin API from the client, with caching.
 * Returns null if the plugin is not loaded.
 */
export function getPluginAPI(client: HeimdallClient): ModmailPluginAPI | null {
  if (cachedPluginAPI) return cachedPluginAPI;

  const api = client.plugins?.get("modmail") as ModmailPluginAPI | undefined;
  if (api) {
    cachedPluginAPI = api;
  }
  return api || null;
}
