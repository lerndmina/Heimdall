/**
 * Welcome API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/welcome
 */

import { Router } from "express";
import { createConfigGetRoutes } from "./config-get.js";
import { createConfigUpdateRoutes } from "./config-update.js";
import { createConfigDeleteRoutes } from "./config-delete.js";
import { createTestRoutes } from "./test.js";
import { createVariablesRoutes } from "./variables.js";
import type { WelcomeService } from "../services/WelcomeService.js";
import type { LibAPI } from "../../lib/index.js";

export interface WelcomeApiDependencies {
  welcomeService: WelcomeService;
  lib: LibAPI;
}

export function createWelcomeRouter(deps: WelcomeApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET    /api/guilds/:guildId/welcome/config
  router.use("/config", createConfigGetRoutes(deps));

  // PUT    /api/guilds/:guildId/welcome/config
  // DELETE /api/guilds/:guildId/welcome/config
  router.use("/config", createConfigUpdateRoutes(deps));
  router.use("/config", createConfigDeleteRoutes(deps));

  // POST /api/guilds/:guildId/welcome/test
  router.use("/test", createTestRoutes(deps));

  // GET /api/guilds/:guildId/welcome/variables
  router.use("/variables", createVariablesRoutes(deps));

  return router;
}
