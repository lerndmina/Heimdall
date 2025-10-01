/**
 * Enhanced logging utility for the Helpie Userbot
 * Uses shared @heimdall/logger package
 */

import { createLogger, LogLevel } from "@heimdall/logger";
import * as path from "path";

// Create the shared logger instance with helpie-specific configuration
const logger = createLogger("helpie-userbot", {
  minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
  enableFileLogging: process.env.LOG_TO_FILE === "true",
  logFilePath: path.join(__dirname, "../..", "logs/helpie-userbot.log"),
  timestampFormat: "locale",
  showCallerInfo: true,
  callerPathDepth: 2,
});

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
     * Configure logger settings
     */
    configure: (
      newConfig: Partial<{
        minLevel: LogLevel;
        enableFileLogging: boolean;
        logFilePath: string;
        timestampFormat: "locale" | "iso";
        showCallerInfo: boolean;
        callerPathDepth: number;
      }>
    ) => {
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
     * Get current logger configuration
     */
    getConfig: () => logger.getConfig(),
  }
);

export default log;
