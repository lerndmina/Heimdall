/**
 * Sentry Error Tracking Initialization
 * Configures Sentry for error monitoring and performance tracking
 */

import * as Sentry from "@sentry/node";
import log from "./logger";

let isInitialized = false;

/**
 * Sentry initialization options
 */
export interface SentryOptions {
  /** Sentry DSN (Data Source Name) */
  dsn?: string;
  /** Environment name (development, staging, production) */
  environment?: string;
  /** Fraction of transactions to sample (0.0 to 1.0) */
  tracesSampleRate?: number;
  /** Fraction of profiles to sample (0.0 to 1.0) */
  profilesSampleRate?: number;
  /** Whether Sentry should be enabled (default: true) */
  enabled?: boolean;
}

/**
 * Initialize Sentry for error tracking
 * Should be called as early as possible in the application lifecycle
 *
 * @param options - Sentry configuration options
 */
export function initializeSentry(options: SentryOptions): void {
  if (isInitialized) {
    log.warn("Sentry already initialized, skipping...");
    return;
  }

  const { dsn, environment = process.env.NODE_ENV || "development", tracesSampleRate = 0.1, profilesSampleRate = 0.1, enabled = true } = options;

  if (!enabled) {
    log.info("Sentry is disabled");
    return;
  }

  if (!dsn) {
    log.warn("Sentry DSN not provided, error tracking will be disabled");
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment,

      // Performance Monitoring
      tracesSampleRate,

      // Profiling
      profilesSampleRate,

      // Release tracking
      release: process.env.SENTRY_RELEASE || undefined,

      // Configure before send to filter/modify events
      beforeSend(event, hint) {
        // Filter out sensitive information
        if (event.request?.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
        }

        // Add custom tags
        event.tags = {
          ...event.tags,
          bot: "heimdall-v1",
        };

        return event;
      },

      // Ignore specific errors
      ignoreErrors: [
        // Discord.js rate limiting
        /DiscordAPIError/,
        /Request timed out/,
        // Common network errors
        /ECONNRESET/,
        /ETIMEDOUT/,
        /ENOTFOUND/,
        // Interaction expired errors
        /Unknown interaction/,
        /Interaction has already been acknowledged/,
      ],
    });

    isInitialized = true;
    log.info(`✅ Sentry initialized (environment: ${environment})`);
  } catch (error) {
    log.error("Failed to initialize Sentry:", error);
  }
}

/**
 * Capture an exception in Sentry
 * @param error - The error to capture
 * @param context - Additional context information
 */
export function captureException(error: Error | unknown, context?: Record<string, unknown>): void {
  if (!isInitialized) return;

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message in Sentry
 * @param message - The message to capture
 * @param level - Severity level
 * @param context - Additional context information
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info", context?: Record<string, unknown>): void {
  if (!isInitialized) return;

  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Set user context for Sentry
 * @param user - User information
 */
export function setUser(user: { id: string; username?: string }): void {
  if (!isInitialized) return;

  Sentry.setUser({
    id: user.id,
    username: user.username,
  });
}

/**
 * Set custom context for Sentry
 * @param key - Context key
 * @param value - Context value
 */
export function setContext(key: string, value: Record<string, unknown>): void {
  if (!isInitialized) return;

  Sentry.setContext(key, value);
}

/**
 * Add breadcrumb for debugging
 * @param message - Breadcrumb message
 * @param category - Breadcrumb category
 * @param level - Severity level
 * @param data - Additional data
 */
export function addBreadcrumb(message: string, category?: string, level: Sentry.SeverityLevel = "info", data?: Record<string, unknown>): void {
  if (!isInitialized) return;

  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
  });
}

/**
 * Flush pending Sentry events
 * Call this before shutdown to ensure all events are sent
 * @param timeout - Timeout in milliseconds (default: 2000)
 */
export async function flush(timeout: number = 2000): Promise<void> {
  if (!isInitialized) return;

  try {
    await Sentry.close(timeout);
    log.info("✅ Sentry flushed");
  } catch (error) {
    log.error("Failed to flush Sentry:", error);
  }
}

// Re-export Sentry for advanced usage
export { Sentry };
