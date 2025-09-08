import { Router } from "express";
import { authenticateApiKey, requireScope } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  getSuggestions,
  getSuggestion,
  updateSuggestion,
  deleteSuggestion,
  getSuggestionConfig,
} from "../controllers/SuggestionController";

export function createSuggestionRoutes(client?: any, handler?: any): Router {
  const router = Router();

  if (client && handler) {
    router.use((req, res, next) => {
      res.locals.client = client;
      res.locals.handler = handler;
      next();
    });
  }

  router.use(authenticateApiKey);
  router.use(requireScope("suggestions:read"));

  router.get("/:guildId/config", asyncHandler(getSuggestionConfig));
  router.get("/:guildId", asyncHandler(getSuggestions));
  router.get("/:guildId/:suggestionId", asyncHandler(getSuggestion));
  router.patch(
    "/:guildId/:suggestionId",
    requireScope("suggestions:write"),
    asyncHandler(updateSuggestion)
  );
  router.delete(
    "/:guildId/:suggestionId",
    requireScope("suggestions:write"),
    asyncHandler(deleteSuggestion)
  );

  return router;
}
