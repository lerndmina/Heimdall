/**
 * Environment Types for Heimdall v1
 */

/**
 * Global environment variables required for the bot to function
 */
export interface GlobalEnv {
  BOT_TOKEN: string;
  OWNER_IDS: string[];
  MONGODB_URI: string;
  MONGODB_DATABASE: string;
  REDIS_URL: string;
  ENCRYPTION_KEY: string;
  /** Shared secret for internal API auth (X-API-Key header) */
  INTERNAL_API_KEY: string;
  DEBUG_LOG: boolean;
  SENTRY_DSN?: string;
  SENTRY_ENABLED?: boolean;
  API_PORT?: number;
  NANOID_LENGTH?: number;
  /** Prefix for owner-only message commands (default: ".") */
  PREFIX: string;
}

/**
 * Plugin environment requirement definition
 */
export interface PluginEnvRequirement {
  key: string;
  required: boolean;
  description?: string;
}
