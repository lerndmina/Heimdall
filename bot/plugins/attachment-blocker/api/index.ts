/**
 * Attachment Blocker API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/attachment-blocker
 */

import { Router } from "express";
import { createConfigGetRoutes } from "./config-get.js";
import { createConfigUpdateRoutes } from "./config-update.js";
import { createChannelsGetRoutes } from "./channels-get.js";
import { createChannelsUpdateRoutes } from "./channels-update.js";
import { createChannelsDeleteRoutes } from "./channels-delete.js";
import type { AttachmentBlockerPluginAPI } from "../index.js";

export type AttachmentBlockerApiDependencies = Pick<AttachmentBlockerPluginAPI, "service" | "lib">;

export function createRouter(api: AttachmentBlockerPluginAPI): Router {
  const deps: AttachmentBlockerApiDependencies = { service: api.service, lib: api.lib };
  const router = Router({ mergeParams: true });

  // GET    /api/guilds/:guildId/attachment-blocker/config
  // PUT    /api/guilds/:guildId/attachment-blocker/config
  router.use("/config", createConfigGetRoutes(deps));
  router.use("/config", createConfigUpdateRoutes(deps));

  // GET    /api/guilds/:guildId/attachment-blocker/channels
  // PUT    /api/guilds/:guildId/attachment-blocker/channels/:channelId
  // DELETE /api/guilds/:guildId/attachment-blocker/channels/:channelId
  router.use("/channels", createChannelsGetRoutes(deps));
  router.use("/channels", createChannelsUpdateRoutes(deps));
  router.use("/channels", createChannelsDeleteRoutes(deps));

  return router;
}
