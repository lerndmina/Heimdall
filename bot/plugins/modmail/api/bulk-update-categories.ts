/**
 * PATCH /api/guilds/:guildId/modmail/conversations/bulk-update-categories
 * Bulk update category assignments for modmail conversations
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import Modmail from "../models/Modmail.js";
import { createLogger } from "../../../src/core/Logger.js";
import { MAX_MODMAIL_BULK_UPDATE_SIZE } from "../../../src/core/DashboardLimits.js";

const log = createLogger("modmail:api:bulk-update-categories");

/**
 * Request body for bulk category update
 */
interface BulkUpdateCategoriesBody {
  updates: Array<{
    modmailId: string;
    categoryId: string;
    categoryName: string;
  }>;
}

/**
 * @swagger
 * /api/guilds/{guildId}/modmail/conversations/bulk-update-categories:
 *   patch:
 *     summary: Bulk update category assignments
 *     description: Update category assignments for multiple modmail conversations at once
 *     tags: [Modmail]
 *     security:
 *       - ApiKey: []
 *       - Bearer: []
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord guild ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     modmailId:
 *                       type: string
 *                       description: Modmail thread ID
 *                     categoryId:
 *                       type: string
 *                       description: New category ID
 *                     categoryName:
 *                       type: string
 *                       description: Category display name
 *                   required:
 *                     - modmailId
 *                     - categoryId
 *                     - categoryName
 *             required:
 *               - updates
 *     responses:
 *       200:
 *         description: Categories updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 updatedCount:
 *                   type: integer
 *                   description: Number of conversations updated
 *                 failedUpdates:
 *                   type: array
 *                   description: List of failed updates with reasons
 *                   items:
 *                     type: object
 *                     properties:
 *                       modmailId:
 *                         type: string
 *                       reason:
 *                         type: string
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export function bulkUpdateCategoriesRoute(_deps: ApiDependencies) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { guildId } = req.params;
      const { updates }: BulkUpdateCategoriesBody = req.body;

      // Validate request body
      if (!Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({
          success: false,
          error: "Invalid request: updates array is required and must not be empty",
        });
        return;
      }

      if (updates.length > MAX_MODMAIL_BULK_UPDATE_SIZE) {
        res.status(400).json({
          success: false,
          error: `Bulk update is limited to ${MAX_MODMAIL_BULK_UPDATE_SIZE} items per request`,
        });
        return;
      }

      // Validate each update
      for (const update of updates) {
        if (!update.modmailId || !update.categoryId || !update.categoryName) {
          res.status(400).json({
            success: false,
            error: "Each update must include modmailId, categoryId, and categoryName",
          });
          return;
        }
      }

      log.info(`Bulk updating categories for ${updates.length} modmail threads in guild ${guildId}`);

      const failedUpdates: Array<{ modmailId: string; reason: string }> = [];
      let updatedCount = 0;

      // Process updates
      for (const update of updates) {
        try {
          const result = await Modmail.updateOne(
            {
              _id: update.modmailId,
              guildId,
            },
            {
              $set: {
                categoryId: update.categoryId,
                categoryName: update.categoryName,
              },
            },
          );

          if (result.matchedCount === 0) {
            failedUpdates.push({
              modmailId: update.modmailId,
              reason: "Modmail thread not found or does not belong to this guild",
            });
          } else {
            updatedCount++;
          }
        } catch (error) {
          log.error(`Failed to update modmail ${update.modmailId}:`, error);
          failedUpdates.push({
            modmailId: update.modmailId,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      log.info(`Bulk update complete: ${updatedCount} updated, ${failedUpdates.length} failed`);

      res.status(200).json({
        success: true,
        updatedCount,
        failedUpdates,
      });
    } catch (error) {
      log.error("Error in bulk update categories:", error);
      next(error);
    }
  };
}
