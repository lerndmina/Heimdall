/**
 * API Key routes for VC Transcription
 *
 * PUT    /apikey         — Set the OpenAI API key (encrypted via GuildEnvService)
 * DELETE /apikey         — Remove the API key
 * GET    /apikey/status  — Check if an API key is configured
 */

import { Router, type Request, type Response } from "express";
import { createLogger } from "../../../src/core/Logger.js";
import type { VCTranscriptionApiDependencies } from "./index.js";

const log = createLogger("vc-transcription");

const OPENAI_KEY_ENV = "VC_TRANSCRIPTION_OPENAI_KEY";

export function createApiKeyRoutes(deps: VCTranscriptionApiDependencies): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET /apikey/status — Check if API key exists (without revealing it)
   */
  router.get("/apikey/status", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;

    try {
      const hasKey = await deps.guildEnvService.hasEnv(guildId, OPENAI_KEY_ENV);
      return res.json({ success: true, data: { hasApiKey: hasKey } });
    } catch (error) {
      log.error("Failed to check API key status:", error);
      return res.status(500).json({
        success: false,
        error: { message: "Failed to check API key status" },
      });
    }
  });

  /**
   * PUT /apikey — Set or update the OpenAI API key
   * Body: { apiKey: string }
   */
  router.put("/apikey", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== "string") {
      return res.status(400).json({
        success: false,
        error: { message: "apiKey is required and must be a string" },
      });
    }

    // Basic validation — OpenAI keys start with "sk-"
    if (!apiKey.startsWith("sk-")) {
      return res.status(400).json({
        success: false,
        error: { message: "Invalid API key format. OpenAI API keys start with 'sk-'" },
      });
    }

    try {
      await deps.guildEnvService.setEnv(guildId, OPENAI_KEY_ENV, apiKey, "dashboard");
      log.info(`OpenAI API key set for guild ${guildId}`);

      return res.json({
        success: true,
        data: { hasApiKey: true },
      });
    } catch (error) {
      log.error("Failed to set API key:", error);
      return res.status(500).json({
        success: false,
        error: { message: "Failed to save API key. Make sure ENCRYPTION_KEY is configured." },
      });
    }
  });

  /**
   * DELETE /apikey — Remove the API key
   */
  router.delete("/apikey", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;

    try {
      await deps.guildEnvService.deleteEnv(guildId, OPENAI_KEY_ENV);
      log.info(`OpenAI API key removed for guild ${guildId}`);

      return res.json({
        success: true,
        data: { hasApiKey: false },
      });
    } catch (error) {
      log.error("Failed to delete API key:", error);
      return res.status(500).json({
        success: false,
        error: { message: "Failed to remove API key" },
      });
    }
  });

  return router;
}
