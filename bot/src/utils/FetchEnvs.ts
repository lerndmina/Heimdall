import { SnowflakeUtil } from "discord.js";
import log from "./log";
import { configDotenv } from "dotenv";
import ms from "ms";

configDotenv(); // Load environment variables from .env file

export const DEFAULT_OPTIONAL_STRING = "optional";

var accessedCount = 0;

function getter() {
  // Key value array to store the environment variables
  var env: {
    BOT_TOKEN: string;
    OWNER_IDS: string[];
    TEST_SERVERS: string[];
    PREFIX: string;
    MONGODB_URI: string;
    MONGODB_DATABASE: string;
    WAITING_EMOJI: string;
    REDIS_URL: string;
    DEBUG_LOG: boolean;
    MODMAIL_TABLE: string;
    DEFAULT_TIMEZONE: string;
    STAFF_ROLE: string;
    OPENAI_API_KEY: string;
    SYSTEM_PROMPT: string;
    ALLOWED_DEPLOY_DOMAINS: string[];
    ZIPLINE_BASEURL: string;
    ZIPLINE_TOKEN: string;
    ENABLE_GITHUB_SUGGESTIONS: boolean;
    GITHUB_TOKEN: string;
    GITHUB_ISSUES_REPO: string;
    GITHUB_PROJECT_ID: string;
    GITHUB_PROJECT_FIELD: string;
    ENABLE_FIVEM_SYSTEMS: boolean;
    ENABLE_TAW_COMMAND: boolean;
    FIVEM_MYSQL_URI: string;
    TAW_API_URL: string;
    TAW_API_KEY: string;
    TAW_MEMBER_ROLE: string;
    MODMAIL_INACTIVITY_WARNING_HOURS: number;
    MODMAIL_AUTO_CLOSE_HOURS: number;
    MODMAIL_CHECK_INTERVAL_MINUTES: number;
    MODMAIL_TESTING_MODE: boolean;
    // API Configuration
    API_PORT: number;
    API_CORS_ORIGINS: string;
    // API_RATE_LIMIT_WINDOW: number; // Disabled
    // API_RATE_LIMIT_MAX: number; // Disabled
    API_TRUST_PROXY: boolean;
  } = {
    BOT_TOKEN: process.env.BOT_TOKEN || "",
    OWNER_IDS: (process.env.OWNER_IDS || "").trim().split(","),
    TEST_SERVERS: (process.env.TEST_SERVERS || "").trim().split(","),
    PREFIX: process.env.PREFIX || "",
    MONGODB_URI: process.env.MONGODB_URI || "",
    MONGODB_DATABASE: process.env.MONGODB_DATABASE || "test",
    WAITING_EMOJI: process.env.WAITING_EMOJI || "",
    REDIS_URL: process.env.REDIS_URL || "",
    DEBUG_LOG: process.env.DEBUG_LOG === "true",
    MODMAIL_TABLE: process.env.MODMAIL_TABLE || "Modmail",
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || "Europe/London",
    STAFF_ROLE: process.env.STAFF_ROLE || DEFAULT_OPTIONAL_STRING,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT || DEFAULT_OPTIONAL_STRING,
    ALLOWED_DEPLOY_DOMAINS: (process.env.ALLOWED_DEPLOY_DOMAINS || "").trim().split(","),
    ZIPLINE_BASEURL: process.env.ZIPLINE_BASEURL || DEFAULT_OPTIONAL_STRING,
    ZIPLINE_TOKEN: process.env.ZIPLINE_TOKEN || DEFAULT_OPTIONAL_STRING,
    ENABLE_GITHUB_SUGGESTIONS: process.env.ENABLE_GITHUB_SUGGESTIONS === "true",
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || DEFAULT_OPTIONAL_STRING,
    GITHUB_ISSUES_REPO: process.env.GITHUB_ISSUES_REPO || DEFAULT_OPTIONAL_STRING,
    GITHUB_PROJECT_ID: process.env.GITHUB_PROJECT_ID || DEFAULT_OPTIONAL_STRING,
    GITHUB_PROJECT_FIELD: process.env.GITHUB_PROJECT_FIELD || DEFAULT_OPTIONAL_STRING,
    ENABLE_FIVEM_SYSTEMS: process.env.ENABLE_FIVEM_SYSTEMS === "true",
    ENABLE_TAW_COMMAND: process.env.ENABLE_TAW_COMMAND === "true",
    FIVEM_MYSQL_URI: process.env.FIVEM_MYSQL_URI || DEFAULT_OPTIONAL_STRING,
    TAW_API_URL: process.env.TAW_API_URL || DEFAULT_OPTIONAL_STRING,
    TAW_API_KEY: process.env.TAW_API_KEY || DEFAULT_OPTIONAL_STRING,
    TAW_MEMBER_ROLE: process.env.TAW_MEMBER_ROLE || DEFAULT_OPTIONAL_STRING,
    MODMAIL_INACTIVITY_WARNING_HOURS: parseInt(
      process.env.MODMAIL_INACTIVITY_WARNING_HOURS || "24"
    ),
    MODMAIL_AUTO_CLOSE_HOURS: parseInt(process.env.MODMAIL_AUTO_CLOSE_HOURS || "168"),
    MODMAIL_CHECK_INTERVAL_MINUTES: parseInt(process.env.MODMAIL_CHECK_INTERVAL_MINUTES || "30"),
    MODMAIL_TESTING_MODE: process.env.MODMAIL_TESTING_MODE === "true",
    // API Configuration
    API_PORT: parseInt(process.env.API_PORT || "3001"),
    API_CORS_ORIGINS: process.env.API_CORS_ORIGINS || "http://localhost:3001",
    // Rate limiting disabled
    // API_RATE_LIMIT_WINDOW: (() => {
    //   const value = process.env.API_RATE_LIMIT_WINDOW || "15m";
    //   // If it's a number string, parse it as milliseconds, otherwise use ms()
    //   if (/^\d+$/.test(value)) {
    //     return parseInt(value);
    //   }
    //   const parsed = ms(value as any);
    //   return typeof parsed === "number" ? parsed : 900000; // fallback to 15 minutes
    // })(),
    // API_RATE_LIMIT_MAX: parseInt(process.env.API_RATE_LIMIT_MAX || "100"), // 100 requests per window
    API_TRUST_PROXY: process.env.API_TRUST_PROXY !== "false", // defaults to true
  };

  var missingKeys: string[] = [];
  for (const keyString in env) {
    const key = keyString as keyof typeof env;
    const value = env[key];
    if (value === undefined || value === null || value === "") {
      missingKeys.push(key);
    }
    if (value === DEFAULT_OPTIONAL_STRING || value[0] === DEFAULT_OPTIONAL_STRING) {
      if (accessedCount > 0) continue;
      log.warn(`Env ${key} is optional and is not set.`);
    }
  }
  if (missingKeys.length > 0) {
    log.error(`ENV ${missingKeys.join(", ")} are missing and are required.`);
    process.exit(1);
  }

  const DISCORD_EPOCH = 1420070400000;
  // Check if the owner and server ids are snowflakes
  env.TEST_SERVERS.forEach((id) => {
    const snowflake = SnowflakeUtil.deconstruct(id);
    if (snowflake.timestamp < DISCORD_EPOCH) {
      // Discord Epoch (2015-01-01)
      log.error(`Env TEST_SERVERS contains an invalid snowflake: ${id}`);
      process.exit(1);
    }
  });

  env.OWNER_IDS.forEach((id) => {
    const snowflake = SnowflakeUtil.deconstruct(id);
    if (snowflake.timestamp < DISCORD_EPOCH) {
      // Discord Epoch (2015-01-01)
      log.error(`Env OWNER_IDS contains an invalid snowflake: ${id}`);
      process.exit(1);
    }
  });

  accessedCount++;
  return env;
}

const cachedEnvs = getter();
export default function () {
  return cachedEnvs;
}

export function envExists(value: any) {
  if (!value || isOptionalUnset(value)) {
    return false;
  }
  return true;
}

export function isOptionalUnset(value: string) {
  return value === DEFAULT_OPTIONAL_STRING;
}
