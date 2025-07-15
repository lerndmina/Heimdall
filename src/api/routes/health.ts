import { Router, Request, Response } from "express";
import { getHealthStatus } from "../controllers/HealthController";
import { createSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../middleware/errorHandler";
import { optionalApiKeyAuth } from "../middleware/auth";

export function createHealthRoutes(client: any, handler: any): Router {
  const router = Router();

  /**
   * GET /api/health
   * Get health status - detailed if authenticated, simple if not
   */
  router.get(
    "/health",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // If not authenticated, return simple OK response
      if (!req.apiKey) {
        return res.status(200).json({ status: "ok" });
      }

      // If authenticated, return full health details
      const health = getHealthStatus(client, handler);
      const statusCode = health.status === "healthy" ? 200 : 503;
      res.status(statusCode).json(createSuccessResponse(health, req.requestId));
    })
  );

  /**
   * GET /health (without /api prefix)
   * Get health status - detailed if authenticated, simple if not
   */
  router.get(
    "/",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // If not authenticated, return simple OK response
      if (!req.apiKey) {
        return res.status(200).json({ status: "ok" });
      }

      // If authenticated, return full health details
      const health = getHealthStatus(client, handler);
      const statusCode = health.status === "healthy" ? 200 : 503;
      res.status(statusCode).json(createSuccessResponse(health, req.requestId));
    })
  );

  /**
   * GET /api/health/simple
   * Simple health check for load balancers (no auth required)
   */
  router.get(
    "/health/simple",
    asyncHandler(async (req: Request, res: Response) => {
      const health = getHealthStatus(client, handler);

      if (health.status === "healthy") {
        res.status(200).json({ status: "ok" });
      } else {
        res.status(503).json({ status: "error" });
      }
    })
  );

  /**
   * GET /simple (without /api prefix)
   * Simple health check for load balancers (no auth required)
   */
  router.get(
    "/simple",
    asyncHandler(async (req: Request, res: Response) => {
      const health = getHealthStatus(client, handler);

      if (health.status === "healthy") {
        res.status(200).json({ status: "ok" });
      } else {
        res.status(503).json({ status: "error" });
      }
    })
  );

  /**
   * GET /api/health/discord
   * Discord-specific health check (requires authentication)
   */
  router.get(
    "/health/discord",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // Require authentication for detailed component info
      if (!req.apiKey) {
        return res
          .status(401)
          .json({ error: "Authentication required for detailed health information" });
      }

      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.discord, req.requestId));
    })
  );

  /**
   * GET /discord (without /api prefix)
   * Discord-specific health check (requires authentication)
   */
  router.get(
    "/discord",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // Require authentication for detailed component info
      if (!req.apiKey) {
        return res
          .status(401)
          .json({ error: "Authentication required for detailed health information" });
      }

      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.discord, req.requestId));
    })
  );

  /**
   * GET /api/health/database
   * Database-specific health check (requires authentication)
   */
  router.get(
    "/health/database",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // Require authentication for detailed component info
      if (!req.apiKey) {
        return res
          .status(401)
          .json({ error: "Authentication required for detailed health information" });
      }

      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.database, req.requestId));
    })
  );

  /**
   * GET /database (without /api prefix)
   * Database-specific health check (requires authentication)
   */
  router.get(
    "/database",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // Require authentication for detailed component info
      if (!req.apiKey) {
        return res
          .status(401)
          .json({ error: "Authentication required for detailed health information" });
      }

      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.database, req.requestId));
    })
  );

  /**
   * GET /api/health/redis
   * Redis-specific health check (requires authentication)
   */
  router.get(
    "/health/redis",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // Require authentication for detailed component info
      if (!req.apiKey) {
        return res
          .status(401)
          .json({ error: "Authentication required for detailed health information" });
      }

      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.redis, req.requestId));
    })
  );

  /**
   * GET /redis (without /api prefix)
   * Redis-specific health check (requires authentication)
   */
  router.get(
    "/redis",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      // Require authentication for detailed component info
      if (!req.apiKey) {
        return res
          .status(401)
          .json({ error: "Authentication required for detailed health information" });
      }

      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.redis, req.requestId));
    })
  );

  return router;
}
