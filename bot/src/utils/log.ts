/**
 * Enhanced logging utility for the Discord bot
 * Now uses shared @heimdall/logger package with backward compatibility
 */

import { createLogger, LogLevel } from "@heimdall/logger";
import * as path from "path";

// Create the shared logger instance with bot-specific configuration
const logger = createLogger("bot", {
  minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
  enableFileLogging: process.env.LOG_TO_FILE === "true",
  logFilePath: path.join(__dirname, "../..", "logs/bot.log"),
  timestampFormat: "locale",
  showCallerInfo: true,
  callerPathDepth: 2,
});

// Legacy LoggerConfig type for backward compatibility
type LoggerConfig = {
  minLevel: LogLevel;
  enableFileLogging: boolean;
  logFilePath: string;
  timestampFormat: "locale" | "iso";
  showCallerInfo: boolean;
  callerPathDepth: number;
};

// Backward compatible log object that matches the old interface
const log = Object.assign(
  (...args: unknown[]) => {
    logger.info(...args);
  },
  {
    info: (...args: unknown[]) => logger.info(...args),
    warn: (...args: unknown[]) => logger.warn(...args),
    error: (...args: unknown[]) => logger.error(...args),
    debug: (...args: unknown[]) => logger.debug(...args),

    /**
     * Configure logger settings (backward compatibility)
     */
    configure: (newConfig: Partial<LoggerConfig>) => {
      // Map old config to new logger configuration
      logger.configure({
        minLevel: newConfig.minLevel,
        enableFileLogging: newConfig.enableFileLogging,
        logFilePath: newConfig.logFilePath,
        timestampFormat: newConfig.timestampFormat,
        showCallerInfo: newConfig.showCallerInfo,
        callerPathDepth: newConfig.callerPathDepth,
      });
    },

    /**
     * Get current logger configuration (backward compatibility)
     */
    getConfig: (): LoggerConfig => {
      const config = logger.getConfig();
      return {
        minLevel: config.minLevel,
        enableFileLogging: config.enableFileLogging,
        logFilePath: config.logFilePath || path.join(__dirname, "../..", "logs/bot.log"),
        timestampFormat: config.timestampFormat,
        showCallerInfo: config.showCallerInfo,
        callerPathDepth: config.callerPathDepth,
      };
    },

    /**
     * Log levels enum for configuration (re-export for compatibility)
     */
    LogLevel,
  }
);

export default log;
