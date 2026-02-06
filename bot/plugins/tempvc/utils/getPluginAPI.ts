/**
 * Shared utility for getting the tempvc plugin API from the client.
 * Uses a module-level cache that resets on hot-reload (module re-evaluation).
 */

import type { HeimdallClient } from "../../../src/types/Client.js";
import type { TempVCPluginAPI } from "../index.js";

let cachedPluginAPI: TempVCPluginAPI | null = null;

/**
 * Get the tempvc plugin API from the client, with caching.
 * Returns null if the plugin is not loaded.
 */
export function getPluginAPI(client: HeimdallClient): TempVCPluginAPI | null {
  if (cachedPluginAPI) return cachedPluginAPI;

  const api = client.plugins?.get("tempvc") as TempVCPluginAPI | undefined;
  if (api) {
    cachedPluginAPI = api;
  }
  return api || null;
}
