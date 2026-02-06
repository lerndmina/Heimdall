/**
 * SupportBan Model - Universal ban system for tickets and modmail
 *
 * This provides a unified ban system that works for both tickets and modmail threads.
 *
 * Features:
 * - Support for temporary and permanent bans
 * - System-specific bans (TICKET, MODMAIL, or BOTH)
 * - Expiration tracking with automatic validation
 * - Block statistics and auditing
 * - Comprehensive indexing for performance
 * - Redis caching for improved performance (5-minute TTL)
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import type { RedisClientType } from "redis";

/**
 * Ban type enum - determines duration
 */
export enum SupportBanType {
  TEMPORARY = "temporary",
  PERMANENT = "permanent",
}

/**
 * System type enum - determines which systems the ban applies to
 */
export enum SupportBanSystem {
  TICKET = "ticket", // Only blocks ticket creation
  MODMAIL = "modmail", // Only blocks modmail creation
  BOTH = "both", // Blocks both tickets and modmail
}

/**
 * Interface for previous ban history records
 */
export interface PreviousBanRecord {
  bannedAt: Date;
  bannedBy: string;
  reason: string;
  systemType: SupportBanSystem;
  banType: SupportBanType;
  expiresAt?: Date;
  unbannedAt?: Date;
  unbannedBy?: string;
  unbanReason?: string;
  ticketsBlockedCount: number;
  modmailsBlockedCount: number;
}

/**
 * Schema for previous ban records (history)
 */
const PreviousBanSchema = new Schema(
  {
    bannedAt: {
      type: Date,
      required: true,
    },
    bannedBy: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    systemType: {
      type: String,
      enum: Object.values(SupportBanSystem),
      required: true,
    },
    banType: {
      type: String,
      enum: Object.values(SupportBanType),
      required: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    unbannedAt: {
      type: Date,
      default: null,
    },
    unbannedBy: {
      type: String,
      default: null,
    },
    unbanReason: {
      type: String,
      default: null,
    },
    ticketsBlockedCount: {
      type: Number,
      default: 0,
    },
    modmailsBlockedCount: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

/**
 * SupportBan Schema - Universal ban for support systems
 */
const SupportBanSchema = new Schema(
  {
    /** MongoDB ObjectId (auto-generated) */
    banId: {
      type: Schema.Types.ObjectId,
      auto: true,
    },

    /** Guild where the ban applies */
    guildId: {
      type: String,
      required: true,
      index: true,
    },

    /** User who is banned */
    userId: {
      type: String,
      required: true,
      index: true,
    },

    /** Which system(s) the ban applies to */
    systemType: {
      type: String,
      enum: Object.values(SupportBanSystem),
      required: true,
      default: SupportBanSystem.BOTH,
      index: true,
    },

    /** Type of ban (temporary or permanent) */
    banType: {
      type: String,
      enum: Object.values(SupportBanType),
      required: true,
    },

    /** Reason for the ban */
    reason: {
      type: String,
      required: true,
      maxlength: 1024,
    },

    /** Staff member who issued the ban */
    bannedBy: {
      type: String,
      required: true,
    },

    /** When the ban was created */
    bannedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /** When the ban expires (null for permanent bans) */
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    /** Whether the ban is currently active */
    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    /** When the ban was removed (if removed early) */
    removedAt: {
      type: Date,
      default: null,
    },

    /** Staff member who removed the ban */
    removedBy: {
      type: String,
      default: null,
    },

    /** Reason for removing the ban */
    removalReason: {
      type: String,
      default: null,
      maxlength: 1024,
    },

    /** User's display name at time of ban (for audit trail) */
    userDisplayName: {
      type: String,
      required: true,
    },

    /** Statistics - how many tickets have been blocked */
    ticketsBlockedCount: {
      type: Number,
      default: 0,
    },

    /** Statistics - how many modmail threads have been blocked */
    modmailsBlockedCount: {
      type: Number,
      default: 0,
    },

    /** When the last block attempt occurred */
    lastBlockedAt: {
      type: Date,
      default: null,
    },

    /** History of previous bans for this user (preserved on unban) */
    previousBans: {
      type: [PreviousBanSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "supportbans",
  },
);

// ==================== INDEXES ====================

/**
 * Compound index for fast active ban lookups per guild
 */
SupportBanSchema.index({ guildId: 1, userId: 1, active: 1 });

/**
 * Compound index for expiration checks
 */
SupportBanSchema.index({ active: 1, expiresAt: 1 });

/**
 * Compound index for system-specific lookups
 */
SupportBanSchema.index({ guildId: 1, systemType: 1, active: 1 });

// ==================== INSTANCE METHODS ====================

/**
 * Check if the ban has expired
 */
SupportBanSchema.methods.isExpired = function (): boolean {
  if (this.banType === SupportBanType.PERMANENT) {
    return false;
  }

  if (!this.expiresAt) {
    return false;
  }

  return new Date() > this.expiresAt;
};

/**
 * Get remaining time in milliseconds (returns 0 for permanent or expired)
 */
SupportBanSchema.methods.getTimeRemaining = function (): number {
  if (this.banType === SupportBanType.PERMANENT) {
    return Infinity;
  }

  if (!this.expiresAt) {
    return 0;
  }

  const remaining = this.expiresAt.getTime() - Date.now();
  return Math.max(0, remaining);
};

/**
 * Check if this ban applies to a specific system
 */
SupportBanSchema.methods.appliesTo = function (system: SupportBanSystem): boolean {
  return this.systemType === SupportBanSystem.BOTH || this.systemType === system;
};

/**
 * Increment block count for a specific system
 */
SupportBanSchema.methods.incrementBlockCount = async function (system: SupportBanSystem): Promise<void> {
  if (system === SupportBanSystem.TICKET) {
    this.ticketsBlockedCount += 1;
  } else if (system === SupportBanSystem.MODMAIL) {
    this.modmailsBlockedCount += 1;
  } else {
    // BOTH - increment both counters
    this.ticketsBlockedCount += 1;
    this.modmailsBlockedCount += 1;
  }

  this.lastBlockedAt = new Date();
  await this.save();
};

// ==================== REDIS INJECTION ====================

/**
 * Static Redis client for caching
 */
let redisClient: RedisClientType | null = null;

/**
 * Cache key for ban status
 */
function getBanCacheKey(guildId: string, userId: string, system: SupportBanSystem): string {
  return `SupportBan:${guildId}:${userId}:${system}`;
}

/**
 * Cache TTL in seconds (5 minutes)
 */
const CACHE_TTL = 300;

/**
 * Invalidate cached ban status for all systems
 */
async function invalidateBanCache(guildId: string, userId: string): Promise<void> {
  const redis = redisClient;
  if (!redis) return;

  try {
    // Delete cache for all system types
    const keys = [getBanCacheKey(guildId, userId, SupportBanSystem.TICKET), getBanCacheKey(guildId, userId, SupportBanSystem.MODMAIL), getBanCacheKey(guildId, userId, SupportBanSystem.BOTH)];

    await Promise.all(keys.map((key) => redis.del(key)));
  } catch (err) {
    // Silently fail on cache invalidation errors
  }
}

// ==================== STATIC METHODS ====================

/**
 * Set Redis client for caching (called by plugin init)
 */
SupportBanSchema.statics.setRedis = function (client: RedisClientType): void {
  redisClient = client;
};

/**
 * Get Redis client (internal use)
 */
SupportBanSchema.statics.getRedis = function (): RedisClientType | null {
  return redisClient;
};

/**
 * Get active ban for a user in a guild (system-specific) - CACHED
 * Returns null if no active ban or if ban has expired
 * Cache TTL: 5 minutes
 *
 * @param guildId - Guild ID to check
 * @param userId - User ID to check
 * @param system - System type (TICKET, MODMAIL, or BOTH)
 * @param bypassCache - If true, skips cache and queries database directly
 */
SupportBanSchema.statics.getActiveBan = async function (guildId: string, userId: string, system: SupportBanSystem, bypassCache = false): Promise<ISupportBan | null> {
  const cacheKey = getBanCacheKey(guildId, userId, system);

  // Try cache first (unless bypassed)
  if (!bypassCache) {
    const redis = redisClient;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
          // Cache hit
          if (cached === "null") {
            return null; // Cached "no ban"
          }
          const banData = JSON.parse(cached);
          // Reconstruct ban object with methods
          const ban = new this(banData);
          return ban;
        }
      } catch (err) {
        // Continue to database query on cache error
      }
    }
  }

  // Cache miss or bypassed - query database
  const ban = await this.findOne({
    guildId,
    userId,
    active: true,
    $or: [{ systemType: system }, { systemType: SupportBanSystem.BOTH }],
  }).sort({ bannedAt: -1 });

  if (!ban || ban.isExpired()) {
    // Deactivate expired ban
    if (ban && ban.isExpired()) {
      ban.active = false;
      await ban.save();
    }

    // Cache "no ban" result
    const redis = redisClient;
    if (redis) {
      try {
        await redis.setEx(cacheKey, CACHE_TTL, "null");
      } catch (err) {
        // Silently fail on cache errors
      }
    }

    return null;
  }

  // Cache active ban
  const redis = redisClient;
  if (redis) {
    try {
      await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(ban.toObject()));
    } catch (err) {
      // Silently fail on cache errors
    }
  }

  return ban;
};

/**
 * Check if a user is currently banned from a system
 */
SupportBanSchema.statics.isBanned = async function (guildId: string, userId: string, system: SupportBanSystem): Promise<boolean> {
  const Model = this as ISupportBanModel;
  const ban = await Model.getActiveBan(guildId, userId, system);
  return ban !== null;
};

/**
 * Create a new ban
 * Automatically deactivates any existing bans for the user
 */
SupportBanSchema.statics.createBan = async function (data: {
  guildId: string;
  userId: string;
  bannedBy: string;
  reason: string;
  userDisplayName: string;
  systemType: SupportBanSystem;
  banType: SupportBanType;
  expiresAt?: Date;
}): Promise<ISupportBan> {
  // Check if user already has an active ban
  const existingBan = await this.findOne({
    guildId: data.guildId,
    userId: data.userId,
    active: true,
  });

  if (existingBan && !existingBan.isExpired()) {
    throw new Error("User is already banned");
  }

  // Deactivate any existing bans (expired or not)
  await this.updateMany(
    {
      guildId: data.guildId,
      userId: data.userId,
      active: true,
    },
    { active: false },
  );

  // Create new ban
  const ban = new this({
    guildId: data.guildId,
    userId: data.userId,
    bannedBy: data.bannedBy,
    reason: data.reason,
    userDisplayName: data.userDisplayName,
    systemType: data.systemType,
    banType: data.banType,
    expiresAt: data.expiresAt,
    bannedAt: new Date(),
    active: true,
  });

  await ban.save();

  // Invalidate cache
  await invalidateBanCache(data.guildId, data.userId);

  return ban;
};

/**
 * Remove an active ban (unban) and preserve in history
 */
SupportBanSchema.statics.removeBan = async function (guildId: string, userId: string, removedBy: string, removalReason?: string): Promise<ISupportBan | null> {
  const ban = await this.findOne({
    guildId,
    userId,
    active: true,
  });

  if (!ban) {
    return null;
  }

  // Create history record before deactivating
  const historyRecord: PreviousBanRecord = {
    bannedAt: ban.bannedAt,
    bannedBy: ban.bannedBy,
    reason: ban.reason,
    systemType: ban.systemType,
    banType: ban.banType,
    expiresAt: ban.expiresAt || undefined,
    unbannedAt: new Date(),
    unbannedBy: removedBy,
    unbanReason: removalReason || "No reason provided",
    ticketsBlockedCount: ban.ticketsBlockedCount,
    modmailsBlockedCount: ban.modmailsBlockedCount,
  };

  // Add to previous bans history
  ban.previousBans.push(historyRecord);

  ban.active = false;
  ban.removedAt = new Date();
  ban.removedBy = removedBy;
  ban.removalReason = removalReason || "No reason provided";

  await ban.save();

  // Invalidate cache
  await invalidateBanCache(guildId, userId);

  return ban;
};

/**
 * Get all bans for a user in a guild (including inactive)
 */
SupportBanSchema.statics.getUserBans = async function (guildId: string, userId: string): Promise<ISupportBan[]> {
  return await this.find({
    guildId,
    userId,
  }).sort({ bannedAt: -1 });
};

/**
 * Get ban history for a user in a guild (from previousBans array)
 * Returns a flattened list of all previous ban records
 */
SupportBanSchema.statics.getBanHistory = async function (guildId: string, userId: string): Promise<{ currentBan: ISupportBan | null; history: PreviousBanRecord[] }> {
  // Get all ban documents for this user
  const bans = await this.find({
    guildId,
    userId,
  }).sort({ bannedAt: -1 });

  // Find current active ban (if any)
  const currentBan = bans.find((ban: ISupportBan) => ban.active && !ban.isExpired()) || null;

  // Collect all previous bans from all documents
  const history: PreviousBanRecord[] = [];
  for (const ban of bans) {
    if (ban.previousBans && ban.previousBans.length > 0) {
      history.push(...ban.previousBans);
    }
    // Also include inactive bans that aren't in previousBans yet
    if (!ban.active && ban.removedAt) {
      // Check if this ban is already in history to avoid duplicates
      const alreadyInHistory = history.some((h) => h.bannedAt.getTime() === new Date(ban.bannedAt).getTime() && h.bannedBy === ban.bannedBy);
      if (!alreadyInHistory) {
        history.push({
          bannedAt: ban.bannedAt,
          bannedBy: ban.bannedBy,
          reason: ban.reason,
          systemType: ban.systemType,
          banType: ban.banType,
          expiresAt: ban.expiresAt || undefined,
          unbannedAt: ban.removedAt || undefined,
          unbannedBy: ban.removedBy || undefined,
          unbanReason: ban.removalReason || undefined,
          ticketsBlockedCount: ban.ticketsBlockedCount,
          modmailsBlockedCount: ban.modmailsBlockedCount,
        });
      }
    }
  }

  // Sort history by bannedAt descending (most recent first)
  history.sort((a, b) => new Date(b.bannedAt).getTime() - new Date(a.bannedAt).getTime());

  return { currentBan, history };
};

/**
 * Get all active bans in a guild
 */
SupportBanSchema.statics.getGuildBans = async function (guildId: string): Promise<ISupportBan[]> {
  return await this.find({
    guildId,
    active: true,
  }).sort({ bannedAt: -1 });
};

/**
 * Clean up expired bans (run periodically)
 * Also invalidates cache for affected users
 */
SupportBanSchema.statics.cleanupExpiredBans = async function (): Promise<number> {
  // Find expired bans first (to get user IDs for cache invalidation)
  const expiredBans = await this.find({
    active: true,
    banType: SupportBanType.TEMPORARY,
    expiresAt: { $lte: new Date() },
  });

  // Update them to inactive
  const result = await this.updateMany(
    {
      active: true,
      banType: SupportBanType.TEMPORARY,
      expiresAt: { $lte: new Date() },
    },
    {
      active: false,
    },
  );

  // Invalidate cache for all affected users
  if (expiredBans.length > 0) {
    await Promise.all(expiredBans.map((ban: ISupportBan) => invalidateBanCache(ban.guildId, ban.userId)));
  }

  return result.modifiedCount;
};

// ==================== TYPE INFERENCE ====================

export type ISupportBan = InferSchemaType<typeof SupportBanSchema> & {
  isExpired(): boolean;
  getTimeRemaining(): number;
  appliesTo(system: SupportBanSystem): boolean;
  incrementBlockCount(system: SupportBanSystem): Promise<void>;
  previousBans: PreviousBanRecord[];
};

export interface ISupportBanModel extends Model<ISupportBan> {
  setRedis(client: RedisClientType): void;
  getRedis(): RedisClientType | null;
  getActiveBan(guildId: string, userId: string, system: SupportBanSystem, bypassCache?: boolean): Promise<ISupportBan | null>;
  isBanned(guildId: string, userId: string, system: SupportBanSystem): Promise<boolean>;
  createBan(data: {
    guildId: string;
    userId: string;
    bannedBy: string;
    reason: string;
    userDisplayName: string;
    systemType: SupportBanSystem;
    banType: SupportBanType;
    expiresAt?: Date;
  }): Promise<ISupportBan>;
  removeBan(guildId: string, userId: string, removedBy: string, removalReason?: string): Promise<ISupportBan | null>;
  getUserBans(guildId: string, userId: string): Promise<ISupportBan[]>;
  getBanHistory(guildId: string, userId: string): Promise<{ currentBan: ISupportBan | null; history: PreviousBanRecord[] }>;
  getGuildBans(guildId: string): Promise<ISupportBan[]>;
  cleanupExpiredBans(): Promise<number>;
}

// ==================== MODEL EXPORT ====================

/**
 * Hot-reload safe model export
 */
const SupportBan = (mongoose.models.SupportBan || model<ISupportBan, ISupportBanModel>("SupportBan", SupportBanSchema)) as ISupportBanModel;

export default SupportBan;
