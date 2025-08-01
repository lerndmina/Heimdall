import type { RepliableInteraction, Client } from "discord.js";
import type { LoadedCommand } from "./Command";
import type { CommandHandler } from "../CommandHandler";

export interface MiddlewareContext {
  interaction: RepliableInteraction;
  command: LoadedCommand;
  client: Client;
  handler: CommandHandler;
  metadata: Map<string, any>;
  startTime: number;
  userId: string;
  guildId?: string;
  channelId: string;
}

export interface MiddlewareResult {
  success: boolean;
  shouldContinue: boolean;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface Middleware {
  name: string;
  priority: number; // Lower number = higher priority (executed first)
  type: "pre" | "post";
  enabled: boolean;
  execute(context: MiddlewareContext, next: () => Promise<void>): Promise<MiddlewareResult>;
}

export interface MiddlewareConfig {
  enableBuiltinMiddleware: boolean;
  enableGlobalMiddleware: boolean;
  enableCommandSpecificMiddleware: boolean;
  maxExecutionTime: number; // Max time for middleware execution in ms
  enableMetrics: boolean;
}

export interface MiddlewareMetrics {
  name: string;
  executionCount: number;
  averageExecutionTime: number;
  errorCount: number;
  lastExecuted?: Date;
  totalExecutionTime: number;
}

export interface MiddlewareExecutionContext {
  middlewareName: string;
  startTime: number;
  endTime?: number;
  success: boolean;
  error?: Error;
  executionTime?: number;
}
