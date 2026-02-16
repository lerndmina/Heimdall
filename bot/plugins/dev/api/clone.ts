/**
 * POST /api/dev/clone - Clone data from another Heimdall instance
 *
 * @swagger
 * /api/dev/clone:
 *   post:
 *     summary: Clone data from another Heimdall instance
 *     description: Copies all collections from a source Heimdall database to the local database
 *     tags: [Dev]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceDbUri
 *             properties:
 *               sourceDbUri:
 *                 type: string
 *                 description: MongoDB connection URI for the source Heimdall database
 *               guildId:
 *                 type: string
 *                 description: Optional guild ID to filter — only clone data for this guild
 *     responses:
 *       200:
 *         description: Clone migration completed
 *       401:
 *         description: Unauthorized - not bot owner
 *       500:
 *         description: Clone migration failed
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DevApiDependencies } from "./index.js";
import { runCloneMigration, type CloneMigrationOptions } from "../utils/cloneMigration.js";
import { broadcastToOwners } from "../../../src/core/broadcast.js";

export function createCloneRoutes(deps: DevApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only allow bot owner to run clone migrations
      const userId = (req as any).user?.id;
      const ownerIds = (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean);

      if (!userId || !ownerIds.includes(userId)) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Only the bot owner can execute clone migrations",
          },
        });
        return;
      }

      const { sourceDbUri, guildId } = req.body;

      if (!sourceDbUri || typeof sourceDbUri !== "string") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "sourceDbUri is required",
          },
        });
        return;
      }

      const options: CloneMigrationOptions = {
        sourceDbUri,
        guildId,
        onProgress: (event) => {
          if (event.result) {
            broadcastToOwners("migration:step_complete", event);
          } else if (event.recordIndex !== undefined) {
            broadcastToOwners("migration:step_progress", event);
          } else {
            broadcastToOwners("migration:step_start", event);
          }
        },
      };

      const stats = await runCloneMigration(options);

      broadcastToOwners("migration:complete", { mode: "clone", stats });

      res.json({ success: true, data: stats });
    } catch (error) {
      broadcastToOwners("migration:error", {
        mode: "clone",
        error: (error as Error).message,
      });
      next(error);
    }
  });

  return router;
}
