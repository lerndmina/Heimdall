/**
 * Environment Loader for Heimdall v1
 * Loads and validates environment variables with strict validation
 */

import { SnowflakeUtil } from "discord.js";
import log from "./logger";
import type { GlobalEnv } from "../types/Env";

// Validator function type
type EnvValidator<T> = (value: T, key: string) => void;

class EnvLoader {
  private globalEnv: GlobalEnv | null = null;

  /**
   * Validators for environment variables
   */
  private readonly validators: Partial<Record<keyof GlobalEnv, EnvValidator<unknown>>> = {
    ENCRYPTION_KEY: (value: unknown, key: string) => {
      const strValue = value as string;
      if (strValue.length !== 64) {
        log.error(`${key} must be exactly 64 characters (32 bytes in hex). Current length: ${strValue.length}`);
        log.error("Generate a valid key with: openssl rand -hex 32");
        process.exit(1);
      }

      if (!/^[0-9a-fA-F]{64}$/.test(strValue)) {
        log.error(`${key} must be a valid hexadecimal string (0-9, a-f, A-F)`);
        log.error("Generate a valid key with: openssl rand -hex 32");
        process.exit(1);
      }
    },

    OWNER_IDS: (value: unknown, key: string) => {
      const ids = value as string[];
      if (ids.length === 0) {
        log.error(`${key} must contain at least one Discord user ID`);
        process.exit(1);
      }

      const DISCORD_EPOCH = 1420070400000;
      for (const id of ids) {
        try {
          const snowflake = SnowflakeUtil.deconstruct(id);
          if (snowflake.timestamp < DISCORD_EPOCH) {
            log.error(`${key} contains an invalid Discord snowflake: ${id}`);
            log.error("Snowflake timestamp is before Discord epoch (2015-01-01)");
            process.exit(1);
          }
        } catch (error) {
          log.error(`${key} contains an invalid snowflake: ${id}`);
          log.error("Must be a valid Discord ID (numeric string)");
          process.exit(1);
        }
      }
    },

    MONGODB_URI: (value: unknown, key: string) => {
      const strValue = value as string;
      try {
        const parsed = new URL(strValue);
        if (parsed.protocol !== "mongodb:" && parsed.protocol !== "mongodb+srv:") {
          log.error(`${key} must use mongodb: or mongodb+srv: protocol. Got: ${parsed.protocol}`);
          process.exit(1);
        }
      } catch (error) {
        log.error(`${key} is not a valid URL: ${strValue}`);
        process.exit(1);
      }
    },

    REDIS_URL: (value: unknown, key: string) => {
      const strValue = value as string;
      try {
        const parsed = new URL(strValue);
        if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
          log.error(`${key} must use redis: or rediss: protocol. Got: ${parsed.protocol}`);
          process.exit(1);
        }
      } catch (error) {
        log.error(`${key} is not a valid URL: ${strValue}`);
        process.exit(1);
      }
    },

    BOT_TOKEN: (value: unknown, key: string) => {
      const strValue = value as string;
      // Basic Discord bot token validation (format: base64.base64.base64)
      const parts = strValue.split(".");
      if (parts.length !== 3) {
        log.error(`${key} appears to be invalid. Discord bot tokens have 3 parts separated by dots.`);
        process.exit(1);
      }
    },

    NANOID_LENGTH: (value: unknown, key: string) => {
      const numValue = value as number;
      if (isNaN(numValue) || numValue < 1 || numValue > 64) {
        log.error(`${key} must be a number between 1 and 64. Got: ${numValue}`);
        process.exit(1);
      }
    },
  };

  /**
   * Run validator for a specific environment variable
   */
  private runValidator<K extends keyof GlobalEnv>(key: K, value: GlobalEnv[K]): void {
    const validator = this.validators[key];
    if (validator) {
      log.debug(`Validating ${key}...`);
      validator(value, key);
    }
  }

  /**
   * Load and validate global environment variables
   * This must succeed or the bot won't start
   */
  loadGlobalEnv(): GlobalEnv {
    if (this.globalEnv) {
      return this.globalEnv;
    }

    log.info("Loading global environment variables...");

    const env: GlobalEnv = {
      BOT_TOKEN: process.env.BOT_TOKEN || "",
      OWNER_IDS: (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean),
      MONGODB_URI: process.env.MONGODB_URI || "",
      MONGODB_DATABASE: process.env.MONGODB_DATABASE || "heimdall_v1",
      REDIS_URL: process.env.REDIS_URL || "",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "",
      DEBUG_LOG: process.env.DEBUG_LOG === "true",
      SENTRY_DSN: process.env.SENTRY_DSN || undefined,
      SENTRY_ENABLED: process.env.SENTRY_ENABLED !== "false",
      API_PORT: parseInt(process.env.API_PORT || "3001", 10),
      NANOID_LENGTH: parseInt(process.env.NANOID_LENGTH || "12", 10),
      PREFIX: process.env.PREFIX || ".",
    };

    // Validate required global envs
    const missingKeys: string[] = [];
    const requiredKeys: (keyof GlobalEnv)[] = ["BOT_TOKEN", "OWNER_IDS", "MONGODB_URI", "REDIS_URL", "ENCRYPTION_KEY"];

    for (const key of requiredKeys) {
      const value = env[key];
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
        missingKeys.push(key);
      }
    }

    if (missingKeys.length > 0) {
      log.error(`Global environment variables missing: ${missingKeys.join(", ")}`);
      log.error("These are required for the bot to start. Please check your .env file.");
      process.exit(1);
    }

    // Run validators for all required keys
    for (const key of requiredKeys) {
      this.runValidator(key, env[key]);
    }

    // Validate optional numeric environment variables if provided
    if (env.NANOID_LENGTH !== undefined) {
      this.runValidator("NANOID_LENGTH", env.NANOID_LENGTH);
    }

    this.globalEnv = env;
    log.info("Global environment loaded and validated successfully");

    return env;
  }

  /**
   * Get global environment (must be loaded first)
   */
  getGlobalEnv(): GlobalEnv {
    if (!this.globalEnv) {
      throw new Error("Global environment not loaded. Call loadGlobalEnv() first.");
    }
    return this.globalEnv;
  }
}

export const envLoader = new EnvLoader();
export default envLoader;
