import type { Middleware, MiddlewareContext, MiddlewareResult } from "../../types/Middleware";
import { createLogger, LogLevel } from "@heimdall/logger";

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  perUser: boolean; // Rate limit per user vs global
  perGuild: boolean; // Rate limit per guild
  skipSuccessfulRequests: boolean; // Only count failed requests
  skipFailedRequests: boolean; // Only count successful requests
  keyGenerator?: (context: MiddlewareContext) => string; // Custom key generation
  message?: string; // Custom rate limit message
}

export class RateLimitMiddleware implements Middleware {
  name = "rate-limit";
  priority = 10; // High priority (executed early)
  type = "pre" as const;
  enabled = true;

  private logger = createLogger("command-handler-ratelimit", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  private requests = new Map<string, { count: number; resetTime: number }>();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      windowMs: 60000, // 1 minute default
      maxRequests: 10, // 10 requests per minute default
      perUser: true,
      perGuild: false,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      message: "You are sending requests too quickly. Please wait before trying again.",
      ...config,
    };
  }

  async execute(context: MiddlewareContext, next: () => Promise<void>): Promise<MiddlewareResult> {
    const key = this.generateKey(context);
    const now = Date.now();

    // Clean up expired entries
    this.cleanupExpiredEntries(now);

    // Get current request data
    let requestData = this.requests.get(key);

    if (!requestData || now >= requestData.resetTime) {
      // Initialize or reset window
      requestData = {
        count: 0,
        resetTime: now + this.config.windowMs,
      };
      this.requests.set(key, requestData);
    }

    // Check if rate limit exceeded
    if (requestData.count >= this.config.maxRequests) {
      const resetIn = Math.ceil((requestData.resetTime - now) / 1000);

      this.logger.warn("Rate limit exceeded", {
        key,
        command: context.command.name,
        user: context.userId,
        count: requestData.count,
        limit: this.config.maxRequests,
        resetIn: `${resetIn}s`,
      });

      // Try to reply if interaction hasn't been responded to
      try {
        if (!context.interaction.replied && !context.interaction.deferred) {
          await context.interaction.reply({
            content: `${this.config.message} (Reset in ${resetIn} seconds)`,
            ephemeral: true,
          });
        }
      } catch (error) {
        this.logger.debug("Could not send rate limit message:", error);
      }

      return {
        success: false,
        shouldContinue: false,
        metadata: {
          rateLimited: true,
          resetIn,
          key,
        },
      };
    }

    // Increment count and continue
    requestData.count++;

    try {
      await next();

      // If configured to skip successful requests, decrement count
      if (this.config.skipSuccessfulRequests) {
        requestData.count--;
      }

      return {
        success: true,
        shouldContinue: true,
        metadata: {
          rateLimitKey: key,
          requestCount: requestData.count,
          remainingRequests: this.config.maxRequests - requestData.count,
        },
      };
    } catch (error) {
      // If configured to skip failed requests, decrement count
      if (this.config.skipFailedRequests) {
        requestData.count--;
      }

      return {
        success: false,
        shouldContinue: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Generate rate limit key based on configuration
   */
  private generateKey(context: MiddlewareContext): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(context);
    }

    const parts: string[] = [context.command.name];

    if (this.config.perUser) {
      parts.push(`user:${context.userId}`);
    }

    if (this.config.perGuild && context.guildId) {
      parts.push(`guild:${context.guildId}`);
    }

    return parts.join(":");
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupExpiredEntries(now: number): void {
    for (const [key, data] of this.requests.entries()) {
      if (now >= data.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Get current rate limit status for a key
   */
  getRateLimitStatus(context: MiddlewareContext): {
    key: string;
    count: number;
    limit: number;
    resetTime: number;
    resetIn: number;
  } | null {
    const key = this.generateKey(context);
    const data = this.requests.get(key);

    if (!data) {
      return null;
    }

    return {
      key,
      count: data.count,
      limit: this.config.maxRequests,
      resetTime: data.resetTime,
      resetIn: Math.max(0, Math.ceil((data.resetTime - Date.now()) / 1000)),
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  resetRateLimit(key: string): boolean {
    return this.requests.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAllRateLimits(): void {
    this.requests.clear();
  }

  /**
   * Get all current rate limit data
   */
  getAllRateLimits(): Map<string, { count: number; resetTime: number }> {
    return new Map(this.requests);
  }
}
