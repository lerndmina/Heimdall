/**
 * Thread Delete Event — Clean up forum-mode suggestions when thread is deleted
 */

import { Events, type AnyThreadChannel } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:threadDelete");

export const event = Events.ThreadDelete;
export const pluginName = "suggestions";

export async function execute(client: HeimdallClient, thread: AnyThreadChannel): Promise<void> {
  try {
    const pluginAPI = client.plugins?.get("suggestions") as SuggestionsPluginAPI | undefined;
    if (!pluginAPI) return;

    await pluginAPI.suggestionService.handleThreadDelete(thread.id);
  } catch (error) {
    log.error(`Error handling thread delete for suggestions:`, error);
  }
}
