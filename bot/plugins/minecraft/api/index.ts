/**
 * Minecraft API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/minecraft
 */

import { Router } from "express";
import { createConfigRoutes } from "./config.js";
import { createConnectionRoutes } from "./connection.js";
import { createLinkRoutes } from "./link.js";
import { createPlayersRoutes } from "./players.js";
import { createRconRoutes } from "./rcon.js";
import { createRequestsRoutes } from "./requests.js";
import { createRoleSyncRoutes } from "./rolesync.js";
import type { MinecraftPluginAPI } from "../index.js";

/** @deprecated Use createRouter instead */
export type MinecraftApiDependencies = Pick<MinecraftPluginAPI, "roleSyncService" | "lib">;

export function createRouter(api: MinecraftPluginAPI): Router {
  const deps = { roleSyncService: api.roleSyncService, lib: api.lib };
  const router = Router({ mergeParams: true });

  // GET/PUT  /api/guilds/:guildId/minecraft/config
  router.use("/config", createConfigRoutes(deps));

  // POST    /api/guilds/:guildId/minecraft/connection-attempt
  router.use("/", createConnectionRoutes(deps));

  // POST    /api/guilds/:guildId/minecraft/request-link-code
  router.use("/", createLinkRoutes(deps));

  // CRUD    /api/guilds/:guildId/minecraft/players
  router.use("/players", createPlayersRoutes(deps));

  // POST    /api/guilds/:guildId/minecraft/test-rcon
  router.use("/", createRconRoutes(deps));

  // GET/POST /api/guilds/:guildId/minecraft/pending, approve, reject, bulk-approve
  router.use("/", createRequestsRoutes(deps));

  // GET/POST /api/guilds/:guildId/minecraft/role-sync
  router.use("/", createRoleSyncRoutes(deps));

  return router;
}
