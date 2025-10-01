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

export default logger;
