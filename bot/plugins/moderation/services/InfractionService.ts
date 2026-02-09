/**
 * InfractionService — Points tracking, decay, and infraction history.
 */

import { createLogger } from "../../../src/core/Logger.js";
import Infraction, { type IInfraction, InfractionSource, InfractionType } from "../models/Infraction.js";
import type { ModerationService } from "./ModerationService.js";

const log = createLogger("moderation:infractions");

type InfractionDoc = IInfraction & { _id: any; createdAt: Date; updatedAt: Date };

export interface RecordInfractionData {
  guildId: string;
  userId: string;
  moderatorId?: string | null;
  source: InfractionSource;
  type: InfractionType;
  reason?: string | null;
  ruleId?: string | null;
  ruleName?: string | null;
  matchedContent?: string | null;
  matchedPattern?: string | null;
  pointsAssigned?: number;
  channelId?: string | null;
  messageId?: string | null;
  duration?: number | null;
  escalationTriggered?: string | null;
}

export interface RecordResult {
  infraction: InfractionDoc;
  activePoints: number;
}

export class InfractionService {
  private moderationService: ModerationService;

  constructor(moderationService: ModerationService) {
    this.moderationService = moderationService;
  }

  /**
   * Record an infraction, compute expiresAt from config, return new infraction + active points.
   */
  async recordInfraction(data: RecordInfractionData): Promise<RecordResult> {
    try {
      const config = await this.moderationService.getConfig(data.guildId);

      // Compute expiry — points-bearing infractions and escalation records
      // both expire so that escalation tiers can re-fire after decay.
      let expiresAt: Date | null = null;
      if (config?.pointDecayEnabled && config.pointDecayDays > 0) {
        if ((data.pointsAssigned ?? 0) > 0 || data.type === InfractionType.ESCALATION) {
          expiresAt = new Date(Date.now() + config.pointDecayDays * 24 * 60 * 60 * 1000);
        }
      }

      // Get current active points to compute total after
      const currentPoints = await this.getActivePoints(data.guildId, data.userId);
      const totalAfter = currentPoints + (data.pointsAssigned ?? 0);

      const infraction = await Infraction.create({
        guildId: data.guildId,
        userId: data.userId,
        moderatorId: data.moderatorId ?? null,
        source: data.source,
        type: data.type,
        reason: data.reason ?? null,
        ruleId: data.ruleId ?? null,
        ruleName: data.ruleName ?? null,
        matchedContent: data.matchedContent ?? null,
        matchedPattern: data.matchedPattern ?? null,
        pointsAssigned: data.pointsAssigned ?? 0,
        totalPointsAfter: totalAfter,
        escalationTriggered: data.escalationTriggered ?? null,
        channelId: data.channelId ?? null,
        messageId: data.messageId ?? null,
        duration: data.duration ?? null,
        expiresAt,
        active: true,
      });

      return {
        infraction: infraction.toObject() as InfractionDoc,
        activePoints: totalAfter,
      };
    } catch (error) {
      log.error("Error recording infraction:", error);
      throw error;
    }
  }

  /**
   * Get active points for a user in a guild.
   * Counts only active infractions where expiresAt is null or in the future.
   */
  async getActivePoints(guildId: string, userId: string): Promise<number> {
    try {
      const now = new Date();

      const result = await Infraction.aggregate([
        {
          $match: {
            guildId,
            userId,
            active: true,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
          },
        },
        {
          $group: {
            _id: null,
            totalPoints: { $sum: "$pointsAssigned" },
          },
        },
      ]);

      return result[0]?.totalPoints ?? 0;
    } catch (error) {
      log.error("Error getting active points:", error);
      return 0;
    }
  }

  /**
   * Get paginated infraction history for a user.
   */
  async getUserInfractions(
    guildId: string,
    userId: string,
    options?: { source?: string; type?: string; page?: number; limit?: number },
  ): Promise<{ infractions: InfractionDoc[]; total: number; page: number; pages: number }> {
    try {
      const page = options?.page ?? 1;
      const limit = options?.limit ?? 10;

      const filter: Record<string, unknown> = { guildId };
      if (userId) filter.userId = userId;
      if (options?.source) filter.source = options.source;
      if (options?.type) filter.type = options.type;

      const total = await Infraction.countDocuments(filter);
      const infractions = (await Infraction.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()) as InfractionDoc[];

      return {
        infractions,
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    } catch (error) {
      log.error("Error getting user infractions:", error);
      return { infractions: [], total: 0, page: 1, pages: 0 };
    }
  }

  /**
   * Clear all active infractions for a user (set active: false).
   */
  async clearUserInfractions(guildId: string, userId: string): Promise<number> {
    try {
      const result = await Infraction.updateMany({ guildId, userId, active: true }, { $set: { active: false } });
      return result.modifiedCount;
    } catch (error) {
      log.error("Error clearing infractions:", error);
      return 0;
    }
  }

  /**
   * Get guild-wide infraction stats for the dashboard.
   */
  async getGuildStats(guildId: string): Promise<{
    totalInfractions: number;
    activeInfractions: number;
    bySource: Record<string, number>;
    byType: Record<string, number>;
    recentInfractions: InfractionDoc[];
  }> {
    try {
      const [totalInfractions, activeInfractions, bySourceAgg, byTypeAgg, recentInfractions] = await Promise.all([
        Infraction.countDocuments({ guildId }),
        Infraction.countDocuments({ guildId, active: true }),
        Infraction.aggregate([{ $match: { guildId } }, { $group: { _id: "$source", count: { $sum: 1 } } }]),
        Infraction.aggregate([{ $match: { guildId } }, { $group: { _id: "$type", count: { $sum: 1 } } }]),
        Infraction.find({ guildId }).sort({ createdAt: -1 }).limit(10).lean() as Promise<InfractionDoc[]>,
      ]);

      const bySource: Record<string, number> = {};
      for (const entry of bySourceAgg) {
        bySource[entry._id] = entry.count;
      }

      const byType: Record<string, number> = {};
      for (const entry of byTypeAgg) {
        byType[entry._id] = entry.count;
      }

      return { totalInfractions, activeInfractions, bySource, byType, recentInfractions };
    } catch (error) {
      log.error("Error getting guild stats:", error);
      return {
        totalInfractions: 0,
        activeInfractions: 0,
        bySource: {},
        byType: {},
        recentInfractions: [],
      };
    }
  }
}
