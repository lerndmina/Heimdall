/**
 * Logging API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/logging
 */

import { Router } from "express";
import { createConfigGetRoutes } from "./config-get.js";
import { createConfigUpdateRoutes } from "./config-update.js";
import { createConfigDeleteRoutes } from "./config-delete.js";
import { createTestRoutes } from "./test.js";
import { createEventsRoutes } from "./events.js";
import type { LoggingPluginAPI } from "../index.js";

/** @deprecated Use createRouter instead */
export type LoggingApiDependencies = Pick<LoggingPluginAPI, "loggingService" | "lib">;

export function createRouter(api: LoggingPluginAPI): Router {
  const deps = { loggingService: api.loggingService, lib: api.lib };
  const router = Router({ mergeParams: true });

  // GET    /api/guilds/:guildId/logging/config
  router.use("/config", createConfigGetRoutes(deps));

  // PUT    /api/guilds/:guildId/logging/config
  router.use("/config", createConfigUpdateRoutes(deps));

  // DELETE /api/guilds/:guildId/logging/config
  router.use("/config", createConfigDeleteRoutes(deps));

  // POST   /api/guilds/:guildId/logging/test
  router.use("/test", createTestRoutes(deps));

  // GET    /api/guilds/:guildId/logging/events
  router.use("/events", createEventsRoutes());

  return router;
}
