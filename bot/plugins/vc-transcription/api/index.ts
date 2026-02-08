/**
 * VC Transcription API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/vc-transcription
 */

import { Router } from "express";
import { createConfigRoutes } from "./config.js";
import { createApiKeyRoutes } from "./apikey.js";
import type { VCTranscriptionPluginAPI } from "../index.js";
import type { GuildEnvService } from "../../../src/core/services/GuildEnvService.js";

/** Narrowed dependencies for API sub-route files */
export interface VCTranscriptionApiDependencies {
  guildEnvService: GuildEnvService;
}

export function createRouter(api: VCTranscriptionPluginAPI): Router {
  const router = Router({ mergeParams: true });

  const deps: VCTranscriptionApiDependencies = {
    guildEnvService: api.guildEnvService,
  };

  // GET/PUT/DELETE /api/guilds/:guildId/vc-transcription/config
  router.use("/", createConfigRoutes(deps));

  // GET/PUT/DELETE /api/guilds/:guildId/vc-transcription/apikey
  router.use("/", createApiKeyRoutes(deps));

  return router;
}
