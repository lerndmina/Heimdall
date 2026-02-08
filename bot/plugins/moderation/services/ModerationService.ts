/**
 * ModerationService — Config and rule CRUD with Redis caching.
 */

import type { RedisClientType } from "redis";
import { createLogger } from "../../../src/core/Logger.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import ModerationConfig, { type IModerationConfig } from "../models/ModerationConfig.js";
import AutomodRule, { type IAutomodRule } from "../models/AutomodRule.js";
import { CACHE_KEYS, CONFIG_CACHE_TTL, RULES_CACHE_TTL } from "../utils/constants.js";

const log = createLogger("moderation:service");

type ConfigDoc = IModerationConfig & { _id: any; createdAt: Date; updatedAt: Date };
type RuleDoc = IAutomodRule & { _id: any; createdAt: Date; updatedAt: Date };

export class ModerationService {
  private client: HeimdallClient;
  private redis: RedisClientType;

  constructor(client: HeimdallClient, redis: RedisClientType) {
    this.client = client;
    this.redis = redis;
  }

  // ── Config ─────────────────────────────────────────────

  async getConfig(guildId: string): Promise<ConfigDoc | null> {
    try {
      // Check cache
      const cached = await this.redis.get(`${CACHE_KEYS.CONFIG}:${guildId}`);
      if (cached) return JSON.parse(cached) as ConfigDoc;

      const config = await ModerationConfig.findOne({ guildId }).lean() as ConfigDoc | null;
      if (config) {
        await this.redis.setEx(`${CACHE_KEYS.CONFIG}:${guildId}`, CONFIG_CACHE_TTL, JSON.stringify(config));
      }
      return config;
    } catch (error) {
      log.error("Error getting config:", error);
      return null;
    }
  }

  async getOrCreateConfig(guildId: string): Promise<ConfigDoc> {
    let config = await this.getConfig(guildId);
    if (!config) {
      const created = await ModerationConfig.create({ guildId });
      config = created.toObject() as ConfigDoc;
      await this.invalidateConfigCache(guildId);
    }
    return config;
  }

  async updateConfig(guildId: string, updates: Partial<IModerationConfig>): Promise<ConfigDoc | null> {
    try {
      const config = await ModerationConfig.findOneAndUpdate(
        { guildId },
        { $set: updates },
        { new: true, upsert: true },
      ).lean() as ConfigDoc | null;
      await this.invalidateConfigCache(guildId);
      return config;
    } catch (error) {
      log.error("Error updating config:", error);
      return null;
    }
  }

  // ── Rules ──────────────────────────────────────────────

  async listRules(guildId: string): Promise<RuleDoc[]> {
    try {
      // Check cache
      const cached = await this.redis.get(`${CACHE_KEYS.RULES}:${guildId}`);
      if (cached) return JSON.parse(cached) as RuleDoc[];

      const rules = await AutomodRule.find({ guildId }).sort({ priority: -1 }).lean() as RuleDoc[];
      await this.redis.setEx(`${CACHE_KEYS.RULES}:${guildId}`, RULES_CACHE_TTL, JSON.stringify(rules));
      return rules;
    } catch (error) {
      log.error("Error listing rules:", error);
      return [];
    }
  }

  async getEnabledRules(guildId: string): Promise<RuleDoc[]> {
    const rules = await this.listRules(guildId);
    return rules.filter((r) => r.enabled);
  }

  async getRule(guildId: string, ruleId: string): Promise<RuleDoc | null> {
    try {
      return await AutomodRule.findOne({ _id: ruleId, guildId }).lean() as RuleDoc | null;
    } catch (error) {
      log.error("Error getting rule:", error);
      return null;
    }
  }

  async createRule(guildId: string, data: Partial<IAutomodRule>): Promise<RuleDoc> {
    const rule = await AutomodRule.create({ ...data, guildId });
    await this.invalidateRulesCache(guildId);
    return rule.toObject() as RuleDoc;
  }

  async updateRule(guildId: string, ruleId: string, updates: Partial<IAutomodRule>): Promise<RuleDoc | null> {
    try {
      const rule = await AutomodRule.findOneAndUpdate(
        { _id: ruleId, guildId },
        { $set: updates },
        { new: true },
      ).lean() as RuleDoc | null;
      await this.invalidateRulesCache(guildId);
      return rule;
    } catch (error) {
      log.error("Error updating rule:", error);
      return null;
    }
  }

  async deleteRule(guildId: string, ruleId: string): Promise<boolean> {
    try {
      const result = await AutomodRule.deleteOne({ _id: ruleId, guildId });
      await this.invalidateRulesCache(guildId);
      return result.deletedCount > 0;
    } catch (error) {
      log.error("Error deleting rule:", error);
      return false;
    }
  }

  async toggleRule(guildId: string, ruleId: string, enabled: boolean): Promise<RuleDoc | null> {
    return this.updateRule(guildId, ruleId, { enabled } as any);
  }

  async findRuleByPresetId(guildId: string, presetId: string): Promise<RuleDoc | null> {
    try {
      return await AutomodRule.findOne({ guildId, isPreset: true, presetId }).lean() as RuleDoc | null;
    } catch (error) {
      log.error("Error finding preset rule:", error);
      return null;
    }
  }

  async deleteRuleByPresetId(guildId: string, presetId: string): Promise<boolean> {
    try {
      const result = await AutomodRule.deleteOne({ guildId, isPreset: true, presetId });
      await this.invalidateRulesCache(guildId);
      return result.deletedCount > 0;
    } catch (error) {
      log.error("Error deleting preset rule:", error);
      return false;
    }
  }

  // ── Cache Invalidation ─────────────────────────────────

  private async invalidateConfigCache(guildId: string): Promise<void> {
    try {
      await this.redis.del(`${CACHE_KEYS.CONFIG}:${guildId}`);
    } catch (error) {
      log.error("Error invalidating config cache:", error);
    }
  }

  private async invalidateRulesCache(guildId: string): Promise<void> {
    try {
      await this.redis.del(`${CACHE_KEYS.RULES}:${guildId}`);
    } catch (error) {
      log.error("Error invalidating rules cache:", error);
    }
  }
}
