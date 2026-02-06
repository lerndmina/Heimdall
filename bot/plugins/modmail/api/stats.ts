/**
 * GET /api/guilds/:guildId/modmail/stats
 * Get modmail statistics for a guild
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import Modmail from "../models/Modmail.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("modmail:api:stats");

/**
 * Statistics response structure
 */
interface ModmailStats {
  total: number;
  open: number;
  resolved: number;
  closed: number;
  averageResponseTime?: number;
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
  }>;
  byStatus: {
    open: number;
    resolved: number;
    closed: number;
  };
  recent: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  activity: {
    totalMessages: number;
    averageMessagesPerConversation: number;
  };
  staffMetrics?: Array<{
    staffId: string;
    claimed: number;
    closed: number;
    averageResponseTime?: number;
  }>;
}

/**
 * @swagger
 * /api/guilds/{guildId}/modmail/stats:
 *   get:
 *     summary: Get modmail statistics
 *     description: Retrieve modmail counts, response times, and breakdowns by category and status
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
 *       - in: query
 *         name: days
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days to include in statistics
 *       - in: query
 *         name: includeStaffMetrics
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include per-staff performance metrics
 *     responses:
 *       200:
 *         description: Modmail statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total conversations
 *                     open:
 *                       type: integer
 *                       description: Currently open conversations
 *                     resolved:
 *                       type: integer
 *                       description: Resolved conversations
 *                     closed:
 *                       type: integer
 *                       description: Closed conversations
 *                     averageResponseTime:
 *                       type: number
 *                       description: Average first response time in hours
 *                     byCategory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           categoryId:
 *                             type: string
 *                           categoryName:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     recent:
 *                       type: object
 *                       properties:
 *                         last24Hours:
 *                           type: integer
 *                         last7Days:
 *                           type: integer
 *                         last30Days:
 *                           type: integer
 *                     activity:
 *                       type: object
 *                       properties:
 *                         totalMessages:
 *                           type: integer
 *                         averageMessagesPerConversation:
 *                           type: number
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
export function statsRoute(_deps: ApiDependencies) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { guildId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      const includeStaffMetrics = req.query.includeStaffMetrics === "true";

      // Validate days parameter
      if (days < 1 || days > 365) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PARAMETER",
            message: "Days parameter must be between 1 and 365",
          },
        });
        return;
      }

      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - days);

      // Get overall statistics
      const [totalCount, openCount, resolvedCount, closedCount] = await Promise.all([
        Modmail.countDocuments({ guildId }),
        Modmail.countDocuments({ guildId, status: "open" }),
        Modmail.countDocuments({ guildId, status: "resolved" }),
        Modmail.countDocuments({ guildId, status: "closed" }),
      ]);

      // Get recent activity
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [recent24h, recent7d, recent30d] = await Promise.all([
        Modmail.countDocuments({ guildId, createdAt: { $gte: last24Hours } }),
        Modmail.countDocuments({ guildId, createdAt: { $gte: last7Days } }),
        Modmail.countDocuments({ guildId, createdAt: { $gte: last30Days } }),
      ]);

      // Get category breakdown
      const categoryStats = await Modmail.aggregate([
        { $match: { guildId, createdAt: { $gte: dateThreshold } } },
        {
          $group: {
            _id: { categoryId: "$categoryId", categoryName: "$categoryName" },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);

      // Get message activity statistics
      const messageStats = await Modmail.aggregate([
        { $match: { guildId } },
        {
          $project: {
            messageCount: { $ifNull: ["$metrics.totalMessages", 0] },
          },
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: "$messageCount" },
            totalConversations: { $sum: 1 },
            averageMessages: { $avg: "$messageCount" },
          },
        },
      ]);

      // Calculate average first response time
      const responseTimeData = await Modmail.aggregate([
        {
          $match: {
            guildId,
            status: { $in: ["resolved", "closed"] },
            "metrics.firstStaffResponseTime": { $exists: true, $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            averageResponseTime: { $avg: "$metrics.firstStaffResponseTime" },
          },
        },
      ]);

      // Convert milliseconds to hours
      const avgResponseTimeHours = responseTimeData[0]?.averageResponseTime ? responseTimeData[0].averageResponseTime / (1000 * 60 * 60) : undefined;

      // Build base stats
      const stats: ModmailStats = {
        total: totalCount,
        open: openCount,
        resolved: resolvedCount,
        closed: closedCount,
        averageResponseTime: avgResponseTimeHours ? Math.round(avgResponseTimeHours * 10) / 10 : undefined,
        byCategory: categoryStats.map((cat) => ({
          categoryId: cat._id.categoryId || "uncategorized",
          categoryName: cat._id.categoryName || "Uncategorized",
          count: cat.count,
        })),
        byStatus: {
          open: openCount,
          resolved: resolvedCount,
          closed: closedCount,
        },
        recent: {
          last24Hours: recent24h,
          last7Days: recent7d,
          last30Days: recent30d,
        },
        activity: {
          totalMessages: messageStats[0]?.totalMessages || 0,
          averageMessagesPerConversation: Math.round((messageStats[0]?.averageMessages || 0) * 10) / 10,
        },
      };

      // Optionally include staff metrics
      if (includeStaffMetrics) {
        const staffStats = await Modmail.aggregate([
          { $match: { guildId, createdAt: { $gte: dateThreshold } } },
          {
            $group: {
              _id: "$claimedBy",
              claimed: { $sum: { $cond: [{ $ifNull: ["$claimedBy", false] }, 1, 0] } },
              closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
              totalResponseTime: {
                $sum: { $ifNull: ["$metrics.firstStaffResponseTime", 0] },
              },
              responseCount: {
                $sum: {
                  $cond: [{ $gt: [{ $ifNull: ["$metrics.firstStaffResponseTime", 0] }, 0] }, 1, 0],
                },
              },
            },
          },
          { $match: { _id: { $ne: null } } },
          { $sort: { claimed: -1 } },
          { $limit: 20 },
        ]);

        stats.staffMetrics = staffStats.map((staff) => ({
          staffId: staff._id,
          claimed: staff.claimed,
          closed: staff.closed,
          averageResponseTime: staff.responseCount > 0 ? Math.round((staff.totalResponseTime / staff.responseCount / (1000 * 60 * 60)) * 10) / 10 : undefined,
        }));
      }

      res.json({
        success: true,
        data: stats,
      });

      log.info(`Modmail stats retrieved for guild ${guildId} via API (${days} days)`);
    } catch (error) {
      log.error("Error retrieving modmail stats:", error);
      next(error);
    }
  };
}
