/**
 * POST /api/dev/migrate - Execute database migration from old bot
 *
 * @swagger
 * /api/dev/migrate:
 *   post:
 *     summary: Import data from old bot database
 *     description: Migrates configuration and data from the old bot to the new plugin-based system
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
 *               - oldDbUri
 *             properties:
 *               oldDbUri:
 *                 type: string
 *                 description: MongoDB connection URI for the old database
 *               guildId:
 *                 type: string
 *                 description: Optional specific guild ID to migrate
 *     responses:
 *       200:
 *         description: Migration completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Migration statistics for each model type
 *       401:
 *         description: Unauthorized - not bot owner
 *       500:
 *         description: Migration failed
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DevApiDependencies } from "./index.js";
import { runFullMigration, type FullMigrationOptions } from "../utils/migration.js";
import { broadcastToOwners } from "../../../src/core/broadcast.js";

export function createMigrateRoutes(deps: DevApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only allow bot owner to run migrations
      const userId = (req as any).user?.id;
      const ownerIds = (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean);

      if (!userId || !ownerIds.includes(userId)) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Only the bot owner can execute migrations",
          },
        });
        return;
      }

      const { oldDbUri, guildId, categoryMapping, importOpenThreads, skipModmail, modmailCollection } = req.body;

      if (!oldDbUri || typeof oldDbUri !== "string") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "oldDbUri is required",
          },
        });
        return;
      }

      const options: FullMigrationOptions = {
        oldDbUri,
        guildId,
        categoryMapping,
        importOpenThreads: importOpenThreads === true,
        skipModmail: skipModmail === true,
        modmailCollection,
        onProgress: (event) => {
          if (event.result) {
            broadcastToOwners("migration:step_complete", { mode: "legacy", ...event });
          } else if (event.recordIndex !== undefined) {
            broadcastToOwners("migration:step_progress", { mode: "legacy", ...event });
          } else {
            broadcastToOwners("migration:step_start", { mode: "legacy", ...event });
          }
        },
      };

      // Execute migration
      const stats = await runFullMigration(options);

      broadcastToOwners("migration:complete", { mode: "legacy", stats });

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
