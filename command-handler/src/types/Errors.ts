import type { RepliableInteraction, Client } from "discord.js";
import type { LoadedCommand } from "./Command";
import type { CommandHandler } from "../CommandHandler";

export enum ErrorCategory {
  USER_ERROR = "user_error",
  SYSTEM_ERROR = "system_error",
  PERMISSION_ERROR = "permission_error",
  VALIDATION_ERROR = "validation_error",
  RATE_LIMIT_ERROR = "rate_limit_error",
  NETWORK_ERROR = "network_error",
  DATABASE_ERROR = "database_error",
  UNKNOWN_ERROR = "unknown_error",
}

export interface ErrorContext {
  commandName: string;
  userId: string;
  guildId?: string;
  channelId: string;
  interaction: RepliableInteraction;
  timestamp: Date;
  category: ErrorCategory;
  recoverable: boolean;
  metadata?: Record<string, any>;
}

export interface ErrorHandlerConfig {
  enableRateLimit: boolean;
  rateLimitWindow: number; // in milliseconds
  rateLimitThreshold: number; // max errors per window
  enableUserFriendlyMessages: boolean;
  enableDetailedLogging: boolean;
  customErrorMessages?: Partial<Record<ErrorCategory, string>>;
}

export interface ErrorResult {
  handled: boolean;
  userMessage?: string;
  shouldReply: boolean;
  shouldLog: boolean;
  shouldRateLimit: boolean;
}

export interface ErrorPattern {
  pattern: RegExp | string;
  category: ErrorCategory;
  recoverable: boolean;
  userMessage?: string;
}
