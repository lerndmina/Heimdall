import { Router, Request, Response } from "express";
import { getHealthStatus } from "../controllers/HealthController";
import { createSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../middleware/errorHandler";

export function createHealthRoutes(client: any, handler: any): Router {
  const router = Router();

  /**
   * GET /api/health
   * Get comprehensive health status
   */
  router.get(
    "/health",
    asyncHandler(async (req: Request, res: Response) => {
      const health = getHealthStatus(client, handler);

      // Set appropriate status code based on health
      const statusCode = health.status === "healthy" ? 200 : 503;

      res.status(statusCode).json(createSuccessResponse(health, req.requestId));
    })
  );

  /**
   * GET /api/health/simple
   * Simple health check for load balancers
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
   * GET /api/health/discord
   * Discord-specific health check
   */
  router.get(
    "/health/discord",
    asyncHandler(async (req: Request, res: Response) => {
      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.discord, req.requestId));
    })
  );

  /**
   * GET /api/health/database
   * Database-specific health check
   */
  router.get(
    "/health/database",
    asyncHandler(async (req: Request, res: Response) => {
      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.database, req.requestId));
    })
  );

  /**
   * GET /api/health/redis
   * Redis-specific health check
   */
  router.get(
    "/health/redis",
    asyncHandler(async (req: Request, res: Response) => {
      const health = getHealthStatus(client, handler);

      res.status(200).json(createSuccessResponse(health.components.redis, req.requestId));
    })
  );

  return router;
}
