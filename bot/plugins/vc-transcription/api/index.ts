/**
 * VC Transcription API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/vc-transcription
 */

import { Router } from "express";
import { createConfigRoutes } from "./config.js";
import { createApiKeyRoutes } from "./apikey.js";
import type { VCTranscriptionPluginAPI } from "../index.js";

export function createRouter(api: VCTranscriptionPluginAPI): Router {
  const router = Router({ mergeParams: true });

  // GET/PUT/DELETE /api/guilds/:guildId/vc-transcription/config
  router.use("/", createConfigRoutes(api));

  // GET/PUT/DELETE /api/guilds/:guildId/vc-transcription/apikey
  router.use("/", createApiKeyRoutes(api));

  return router;
}
