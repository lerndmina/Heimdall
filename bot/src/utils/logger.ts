/**
 * Logger Wrapper for Heimdall v1
 * Uses the core Logger implementation
 */

import { createLogger, LogLevel } from "../core/Logger";

const log = createLogger("heimdall-v1", {
  minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
  enableFileLogging: process.env.LOG_TO_FILE === "true",
  timestampFormat: "locale",
  showCallerInfo: false,
});

export default log;

// Re-export for convenience
export { createLogger, LogLevel } from "../core/Logger";
export type { LoggerConfig, LoggerFunction } from "../core/Logger";
