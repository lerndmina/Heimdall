import { SnowflakeUtil } from "discord.js";
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
    REDIS_URI: process.env.REDIS_URI || "redis://localhost:6379",
    DEEPL_API_KEY: process.env.DEEPL_API_KEY || "",

    // Vector Database (Qdrant) - REQUIRED for context system
    QDRANT_URL: process.env.QDRANT_URL || "",
    QDRANT_PORT: parseInt(process.env.QDRANT_PORT || "443"), // Default to 443 for HTTPS
    QDRANT_API_KEY: process.env.QDRANT_API_KEY || "",

    // Embedding Configuration (optional - sensible defaults)
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    EMBEDDING_CHUNK_SIZE: parseInt(process.env.EMBEDDING_CHUNK_SIZE || "500"),
    EMBEDDING_CHUNK_OVERLAP: parseInt(process.env.EMBEDDING_CHUNK_OVERLAP || "50"),
    VECTOR_SEARCH_LIMIT: parseInt(process.env.VECTOR_SEARCH_LIMIT || "5"),
    VECTOR_SCORE_THRESHOLD: parseFloat(process.env.VECTOR_SCORE_THRESHOLD || "0.25"), // Lowered from 0.7 - embeddings rarely score that high
  };

  var missingKeys: string[] = [];
  var missingOptionalKeys: string[] = [];
  // List only the optional keys - all others are required
  const optionalKeys: (keyof typeof env)[] = [
    "SYSTEM_PROMPT",
    "MONGODB_DATABASE",
    "DEBUG_LOG",
    "DEEPL_API_KEY",
    // Qdrant port is optional (defaults to 443 for HTTPS)
    "QDRANT_PORT",
    // Embedding configs are optional (have defaults)
    "OPENAI_EMBEDDING_MODEL",
    "EMBEDDING_CHUNK_SIZE",
    "EMBEDDING_CHUNK_OVERLAP",
    "VECTOR_SEARCH_LIMIT",
    "VECTOR_SCORE_THRESHOLD",
  ];

  for (const key in env) {
    const typedKey = key as keyof typeof env;

    // Check process.env directly (before defaults are applied)
    const rawValue = process.env[typedKey];
    const isEmpty = rawValue === undefined || rawValue === null || rawValue === "" || rawValue?.trim() === "";

    if (optionalKeys.includes(typedKey)) {
      // Check if optional key is missing
      if (isEmpty) {
        missingOptionalKeys.push(typedKey);
      }
    } else {
      // Check if required key is missing
      if (isEmpty) {
        missingKeys.push(typedKey);
      }
    }
  }

  if (missingOptionalKeys.length > 0) {
    console.warn(`⚠️  Optional ENV ${missingOptionalKeys.join(", ")} are missing (using defaults).`);
  }

  if (missingKeys.length > 0) {
    console.error(`❌ ENV ${missingKeys.join(", ")} are missing and are required.`);
    process.exit(1);
  }

  const DISCORD_EPOCH = 1420070400000;
  // Check if the owner ids are valid snowflakes
  env.OWNER_IDS.forEach((id) => {
    try {
      const snowflake = SnowflakeUtil.deconstruct(id);
      if (snowflake.timestamp < DISCORD_EPOCH) {
        console.error(`Env OWNER_IDS contains an invalid snowflake: ${id}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Env OWNER_IDS contains an invalid snowflake: ${id}`);
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
