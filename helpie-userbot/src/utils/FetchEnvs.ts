import { SnowflakeUtil } from "discord.js";
import log from "./log";
import { configDotenv } from "dotenv";

configDotenv(); // Load environment variables from .env file

export const DEFAULT_OPTIONAL_STRING = "optional";

var accessedCount = 0;

function getter() {
  // Environment variables for Helpie Userbot (User-installable bot only)
  var env = {
    BOT_TOKEN: process.env.BOT_TOKEN || "",
    OWNER_IDS: (process.env.OWNER_IDS || "")
      .trim()
      .split(",")
      .filter((id) => id.length > 0),
    DEBUG_LOG: process.env.DEBUG_LOG === "true",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT || "You are Helpie, a helpful AI assistant integrated into Discord.",
    MONGODB_URI: process.env.MONGODB_URI || "",
    MONGODB_DATABASE: process.env.MONGODB_DATABASE || "helpie",
  };

  var missingKeys: string[] = [];
  const requiredKeys: (keyof typeof env)[] = ["BOT_TOKEN", "OWNER_IDS", "OPENAI_API_KEY", "MONGODB_URI"];

  for (const key of requiredKeys) {
    const value = env[key];
    if (value === undefined || value === null || value === "") {
      missingKeys.push(key);
    } else if (Array.isArray(value) && value.length === 0) {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
    log.error(`ENV ${missingKeys.join(", ")} are missing and are required.`);
    process.exit(1);
  }

  const DISCORD_EPOCH = 1420070400000;
  // Check if the owner ids are valid snowflakes
  env.OWNER_IDS.forEach((id) => {
    try {
      const snowflake = SnowflakeUtil.deconstruct(id);
      if (snowflake.timestamp < DISCORD_EPOCH) {
        log.error(`Env OWNER_IDS contains an invalid snowflake: ${id}`);
        process.exit(1);
      }
    } catch (error) {
      log.error(`Env OWNER_IDS contains an invalid snowflake: ${id}`);
      process.exit(1);
    }
  });

  accessedCount++;
  return env;
}

const cachedEnvs = getter();
export default function fetchEnvs() {
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
