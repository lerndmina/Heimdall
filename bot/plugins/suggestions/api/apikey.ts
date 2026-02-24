/**
 * API Key routes for Suggestions AI titles
 *
 * PUT    /apikey         — Set per-guild OpenAI API key (encrypted)
 * DELETE /apikey         — Remove key
 * GET    /apikey/status  — Check key presence only
 */

import { Router, type Request, type Response } from "express";
import { createLogger } from "../../../src/core/Logger.js";
import type { SuggestionsApiDependencies } from "./index.js";

const log = createLogger("suggestions:apikey");

export const SUGGESTIONS_OPENAI_KEY_ENV = "SUGGESTIONS_OPENAI_KEY";

export function createApiKeyRoutes(deps: SuggestionsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/apikey/status", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;

    try {
      const [hasSuggestionsKey, hasLegacyKey] = await Promise.all([
        deps.guildEnvService.hasEnv(guildId, SUGGESTIONS_OPENAI_KEY_ENV),
        deps.guildEnvService.hasEnv(guildId, "OPENAI_API_KEY"),
      ]);

      return res.json({
        success: true,
        data: {
          hasApiKey: hasSuggestionsKey || hasLegacyKey,
        },
      });
    } catch (error) {
      log.error("Failed to check suggestions API key status:", error);
      return res.status(500).json({
        success: false,
        error: { message: "Failed to check API key status" },
      });
    }
  });

  router.put("/apikey", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== "string") {
      return res.status(400).json({
        success: false,
        error: { message: "apiKey is required and must be a string" },
      });
    }

    if (!apiKey.startsWith("sk-")) {
      return res.status(400).json({
        success: false,
        error: { message: "Invalid API key format. OpenAI API keys start with 'sk-'" },
      });
    }

    try {
      await deps.guildEnvService.setEnv(guildId, SUGGESTIONS_OPENAI_KEY_ENV, apiKey, "dashboard");
      log.info(`Suggestions OpenAI API key set for guild ${guildId}`);

      return res.json({
        success: true,
        data: { hasApiKey: true },
      });
    } catch (error) {
      log.error("Failed to set suggestions API key:", error);
      return res.status(500).json({
        success: false,
        error: { message: "Failed to save API key. Make sure ENCRYPTION_KEY is configured." },
      });
    }
  });

  router.delete("/apikey", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;

    try {
      await deps.guildEnvService.deleteEnv(guildId, SUGGESTIONS_OPENAI_KEY_ENV);
      log.info(`Suggestions OpenAI API key removed for guild ${guildId}`);

      return res.json({
        success: true,
        data: { hasApiKey: false },
      });
    } catch (error) {
      log.error("Failed to delete suggestions API key:", error);
      return res.status(500).json({
        success: false,
        error: { message: "Failed to remove API key" },
      });
    }
  });

  return router;
}
