/**
 * GuildEnvService - Encrypted per-guild environment variables
 *
 * Manages guild-specific environment variables that guild owners/admins set.
 * These are different from bot owner environment variables (set in .env file).
 *
 * Features:
 * - Encrypted storage in MongoDB
 * - Set/check/delete operations
 * - Never exposes decrypted values to users
 */

import log from "../../utils/logger";
import { GuildEnv } from "../models";

export class GuildEnvService {
  private encryptionKey: string;

  constructor(encryptionKey: string) {
    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY is required for GuildEnvService");
    }
    this.encryptionKey = encryptionKey;
    log.info("GuildEnvService initialized");
  }

  /**
   * Set an environment variable for a guild
   * Encrypts the value and stores it in MongoDB
   * Updates existing value if key already exists
   */
  async setEnv(guildId: string, envKey: string, value: string, setBy: string): Promise<void> {
    try {
      const encryptedValue = GuildEnv.encryptValue(value, this.encryptionKey);

      await GuildEnv.findOneAndUpdate(
        { guildId, envKey },
        {
          guildId,
          envKey,
          encryptedValue,
          setBy,
          setAt: new Date(),
        },
        { upsert: true, new: true },
      );

      log.info(`Environment variable "${envKey}" set for guild ${guildId} by user ${setBy}`);
    } catch (error) {
      log.error(`Failed to set environment variable "${envKey}" for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Check if an environment variable exists for a guild
   * Does NOT reveal the value, only whether it's set
   */
  async hasEnv(guildId: string, envKey: string): Promise<boolean> {
    try {
      const exists = await GuildEnv.exists({ guildId, envKey });
      return exists !== null;
    } catch (error) {
      log.error(`Failed to check environment variable "${envKey}" for guild ${guildId}:`, error);
      return false;
    }
  }

  /**
   * Get a decrypted environment variable value
   * FOR INTERNAL BOT USE ONLY - never expose to users!
   */
  async getEnv(guildId: string, envKey: string): Promise<string | null> {
    try {
      const env = await GuildEnv.findOne({ guildId, envKey });

      if (!env) {
        return null;
      }

      const decrypted = GuildEnv.decryptValue(env.encryptedValue, this.encryptionKey);
      return decrypted;
    } catch (error) {
      log.error(`Failed to get environment variable "${envKey}" for guild ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Get all environment variable keys set for a guild
   * Returns only the keys, NOT the values
   */
  async getEnvKeys(guildId: string): Promise<string[]> {
    try {
      const envs = await GuildEnv.find({ guildId }).select("envKey").lean();
      return envs.map((env) => env.envKey);
    } catch (error) {
      log.error(`Failed to get environment variable keys for guild ${guildId}:`, error);
      return [];
    }
  }

  /**
   * Delete an environment variable for a guild
   */
  async deleteEnv(guildId: string, envKey: string): Promise<boolean> {
    try {
      const result = await GuildEnv.findOneAndDelete({ guildId, envKey });

      if (result) {
        log.info(`Environment variable "${envKey}" deleted for guild ${guildId}`);
        return true;
      }

      return false;
    } catch (error) {
      log.error(`Failed to delete environment variable "${envKey}" for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Validate that all required environment variables exist for a guild
   * Returns an object with validity status and missing keys
   */
  async validateGuildEnvs(guildId: string, requiredKeys: string[]): Promise<{ valid: boolean; missing: string[] }> {
    const missing: string[] = [];

    for (const key of requiredKeys) {
      const hasEnv = await this.hasEnv(guildId, key);
      if (!hasEnv) {
        missing.push(key);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Delete all environment variables for a guild
   * Use with caution - this is destructive!
   */
  async deleteAllGuildEnvs(guildId: string): Promise<number> {
    try {
      const result = await GuildEnv.deleteMany({ guildId });
      log.info(`Deleted ${result.deletedCount} environment variables for guild ${guildId}`);
      return result.deletedCount;
    } catch (error) {
      log.error(`Failed to delete all environment variables for guild ${guildId}:`, error);
      throw error;
    }
  }
}
