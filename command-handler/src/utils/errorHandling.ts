import type { ErrorContext, ErrorHandlerConfig, ErrorResult, ErrorPattern } from "../types/Errors";
import { ErrorCategory } from "../types/Errors";
import { createLogger, LogLevel } from "@heimdall/logger";

export class ErrorHandler {
  private logger = createLogger("command-handler-errors", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  private config: ErrorHandlerConfig;
  private errorCounts = new Map<string, { count: number; windowStart: number }>();
  private rateLimitedUsers = new Map<string, number>(); // userId -> expiry timestamp

  // Built-in error patterns for categorization
  private errorPatterns: ErrorPattern[] = [
    {
      pattern: /Missing Permissions|Insufficient permissions/i,
      category: ErrorCategory.PERMISSION_ERROR,
      recoverable: true,
      userMessage: "You don't have permission to use this command.",
    },
    {
      pattern: /Invalid Form Body|ValidationError/i,
      category: ErrorCategory.VALIDATION_ERROR,
      recoverable: true,
      userMessage: "Invalid input provided. Please check your parameters.",
    },
    {
      pattern: /Rate limited|Too Many Requests/i,
      category: ErrorCategory.RATE_LIMIT_ERROR,
      recoverable: true,
      userMessage: "You're sending requests too quickly. Please wait a moment.",
    },
    {
      pattern: /ENOTFOUND|ECONNREFUSED|Network request failed/i,
      category: ErrorCategory.NETWORK_ERROR,
      recoverable: true,
      userMessage: "Network error occurred. Please try again later.",
    },
    {
      pattern: /Database|MongoDB|Connection/i,
      category: ErrorCategory.DATABASE_ERROR,
      recoverable: true,
      userMessage: "Database error occurred. Please try again later.",
    },
  ];

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      enableRateLimit: true,
      rateLimitWindow: 60000, // 1 minute
      rateLimitThreshold: 5, // 5 errors per minute
      enableUserFriendlyMessages: true,
      enableDetailedLogging: true,
      ...config,
    };
  }

  /**
   * Main error handling method
   */
  async handleError(error: Error, context: ErrorContext): Promise<ErrorResult> {
    const category = this.categorizeError(error);
    const isRateLimited = this.shouldRateLimit(context);

    context.category = category;
    context.recoverable = this.isRecoverable(error, category);

    // Log the error if enabled
    if (this.config.enableDetailedLogging) {
      this.logError(error, context);
    }

    // Check if user should be rate limited
    if (isRateLimited) {
      this.applyRateLimit(context.userId);
      return {
        handled: true,
        userMessage: "You're experiencing too many errors. Please wait before trying again.",
        shouldReply: true,
        shouldLog: false,
        shouldRateLimit: true,
      };
    }

    // Generate user-friendly message
    const userMessage = this.generateUserFriendlyMessage(error, category);

    // Determine if we should reply to the user
    const shouldReply = this.shouldReplyToUser(context, category);

    return {
      handled: true,
      userMessage: shouldReply ? userMessage : undefined,
      shouldReply,
      shouldLog: this.config.enableDetailedLogging,
      shouldRateLimit: false,
    };
  }

  /**
   * Categorize error based on patterns and error properties
   */
  categorizeError(error: Error): ErrorCategory {
    const errorMessage = error.message;

    // Check against known patterns
    for (const pattern of this.errorPatterns) {
      const regex = typeof pattern.pattern === "string" ? new RegExp(pattern.pattern, "i") : pattern.pattern;

      if (regex.test(errorMessage)) {
        return pattern.category;
      }
    }

    // Check error name/type
    if (error.name === "ValidationError") {
      return ErrorCategory.VALIDATION_ERROR;
    }

    if (error.name === "PermissionError" || error.name === "Forbidden") {
      return ErrorCategory.PERMISSION_ERROR;
    }

    // Default categorization based on common patterns
    if (errorMessage.toLowerCase().includes("user") || errorMessage.toLowerCase().includes("input") || errorMessage.toLowerCase().includes("invalid")) {
      return ErrorCategory.USER_ERROR;
    }

    return ErrorCategory.SYSTEM_ERROR;
  }

  /**
   * Check if user should be rate limited based on error frequency
   */
  shouldRateLimit(context: ErrorContext): boolean {
    if (!this.config.enableRateLimit) {
      return false;
    }

    // Check if user is already rate limited
    const rateLimitExpiry = this.rateLimitedUsers.get(context.userId);
    if (rateLimitExpiry && Date.now() < rateLimitExpiry) {
      return true;
    }

    // Clean up expired rate limits
    if (rateLimitExpiry && Date.now() >= rateLimitExpiry) {
      this.rateLimitedUsers.delete(context.userId);
    }

    const now = Date.now();
    const userKey = `${context.userId}:${context.commandName}`;
    const errorData = this.errorCounts.get(userKey);

    if (!errorData || now - errorData.windowStart > this.config.rateLimitWindow) {
      // Start new window
      this.errorCounts.set(userKey, { count: 1, windowStart: now });
      return false;
    }

    // Increment count in current window
    errorData.count++;

    return errorData.count >= this.config.rateLimitThreshold;
  }

  /**
   * Apply rate limit to user
   */
  private applyRateLimit(userId: string): void {
    const expiry = Date.now() + this.config.rateLimitWindow;
    this.rateLimitedUsers.set(userId, expiry);
  }

  /**
   * Determine if error is recoverable
   */
  private isRecoverable(error: Error, category: ErrorCategory): boolean {
    const pattern = this.errorPatterns.find((p) => {
      const regex = typeof p.pattern === "string" ? new RegExp(p.pattern, "i") : p.pattern;
      return regex.test(error.message);
    });

    if (pattern) {
      return pattern.recoverable;
    }

    // Default recoverability by category
    switch (category) {
      case ErrorCategory.USER_ERROR:
      case ErrorCategory.VALIDATION_ERROR:
      case ErrorCategory.PERMISSION_ERROR:
      case ErrorCategory.RATE_LIMIT_ERROR:
        return true;
      case ErrorCategory.NETWORK_ERROR:
      case ErrorCategory.DATABASE_ERROR:
        return true; // Usually temporary
      case ErrorCategory.SYSTEM_ERROR:
      case ErrorCategory.UNKNOWN_ERROR:
      default:
        return false;
    }
  }

  /**
   * Generate user-friendly error message
   */
  generateUserFriendlyMessage(error: Error, category: ErrorCategory): string {
    // Check for custom messages in config
    if (this.config.customErrorMessages?.[category]) {
      return this.config.customErrorMessages[category]!;
    }

    // Check for pattern-specific messages
    const pattern = this.errorPatterns.find((p) => {
      const regex = typeof p.pattern === "string" ? new RegExp(p.pattern, "i") : p.pattern;
      return regex.test(error.message);
    });

    if (pattern?.userMessage) {
      return pattern.userMessage;
    }

    // Default messages by category
    switch (category) {
      case ErrorCategory.USER_ERROR:
        return "There was an issue with your request. Please check your input and try again.";
      case ErrorCategory.PERMISSION_ERROR:
        return "You don't have permission to use this command.";
      case ErrorCategory.VALIDATION_ERROR:
        return "Invalid input provided. Please check your parameters and try again.";
      case ErrorCategory.RATE_LIMIT_ERROR:
        return "You're sending requests too quickly. Please wait a moment and try again.";
      case ErrorCategory.NETWORK_ERROR:
        return "Network error occurred. Please try again later.";
      case ErrorCategory.DATABASE_ERROR:
        return "Database error occurred. Please try again later.";
      case ErrorCategory.SYSTEM_ERROR:
        return "An internal error occurred. Please try again later.";
      case ErrorCategory.UNKNOWN_ERROR:
      default:
        return "An unexpected error occurred. Please try again later.";
    }
  }

  /**
   * Determine if we should reply to the user
   */
  private shouldReplyToUser(context: ErrorContext, category: ErrorCategory): boolean {
    if (!this.config.enableUserFriendlyMessages) {
      return false;
    }

    // Always reply for user errors and validation errors
    if (category === ErrorCategory.USER_ERROR || category === ErrorCategory.VALIDATION_ERROR || category === ErrorCategory.PERMISSION_ERROR || category === ErrorCategory.RATE_LIMIT_ERROR) {
      return true;
    }

    // Reply for recoverable errors
    return context.recoverable;
  }

  /**
   * Log error with context
   */
  private logError(error: Error, context: ErrorContext): void {
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context: {
        commandName: context.commandName,
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        category: context.category,
        recoverable: context.recoverable,
        timestamp: context.timestamp.toISOString(),
      },
    };

    switch (context.category) {
      case ErrorCategory.USER_ERROR:
      case ErrorCategory.VALIDATION_ERROR:
        this.logger.warn("User error occurred:", logData);
        break;
      case ErrorCategory.PERMISSION_ERROR:
      case ErrorCategory.RATE_LIMIT_ERROR:
        this.logger.info("Permission/Rate limit error:", logData);
        break;
      case ErrorCategory.SYSTEM_ERROR:
      case ErrorCategory.DATABASE_ERROR:
      case ErrorCategory.NETWORK_ERROR:
      case ErrorCategory.UNKNOWN_ERROR:
      default:
        this.logger.error("System error occurred:", logData);
        break;
    }
  }

  /**
   * Add custom error pattern
   */
  addErrorPattern(pattern: ErrorPattern): void {
    this.errorPatterns.push(pattern);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): { totalErrors: number; errorsByCategory: Record<ErrorCategory, number> } {
    const stats = {
      totalErrors: 0,
      errorsByCategory: {} as Record<ErrorCategory, number>,
    };

    // Initialize categories
    Object.values(ErrorCategory).forEach((category) => {
      stats.errorsByCategory[category] = 0;
    });

    // This would be enhanced with persistent storage in a real implementation
    return stats;
  }

  /**
   * Clear rate limits (useful for testing or admin commands)
   */
  clearRateLimits(userId?: string): void {
    if (userId) {
      this.rateLimitedUsers.delete(userId);
      // Also clear error counts for this user
      for (const [key] of this.errorCounts) {
        if (key.startsWith(`${userId}:`)) {
          this.errorCounts.delete(key);
        }
      }
    } else {
      this.rateLimitedUsers.clear();
      this.errorCounts.clear();
    }
  }
}
