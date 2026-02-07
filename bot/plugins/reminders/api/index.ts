/**
 * Reminders API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/reminders
 *
 * Note: Reminders are user-scoped but mounted under guild routes for API
 * consistency. The userId is passed as a query parameter or in the body.
 */

import { Router } from "express";
import { createReminderListRoutes } from "./list.js";
import { createReminderGetRoutes } from "./get.js";
import { createReminderCreateRoutes } from "./create.js";
import { createReminderUpdateRoutes } from "./update.js";
import { createReminderDeleteRoutes } from "./delete.js";
import type { RemindersPluginAPI } from "../index.js";

/** @deprecated Use createRouter instead */
export type RemindersApiDependencies = Pick<RemindersPluginAPI, "reminderService" | "lib">;

export function createRouter(api: RemindersPluginAPI): Router {
  const deps = { reminderService: api.reminderService, lib: api.lib };
  const router = Router({ mergeParams: true });

  // GET    /api/guilds/:guildId/reminders?userId=...
  router.use("/", createReminderListRoutes(deps));

  // POST   /api/guilds/:guildId/reminders
  router.use("/", createReminderCreateRoutes(deps));

  // GET    /api/guilds/:guildId/reminders/:reminderId
  router.use("/", createReminderGetRoutes(deps));

  // PUT    /api/guilds/:guildId/reminders/:reminderId
  router.use("/", createReminderUpdateRoutes(deps));

  // DELETE /api/guilds/:guildId/reminders/:reminderId
  router.use("/", createReminderDeleteRoutes(deps));

  return router;
}
