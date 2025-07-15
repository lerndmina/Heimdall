/**
 * Enhanced logging utility for the Discord bot
 */

import * as fs from "fs";
import * as path from "path";

// Define log levels as an enum for better type safety
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Color configuration for different log levels
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  debug: "\x1b[35m", // magenta
};

// Logger configuration
type LoggerConfig = {
  minLevel: LogLevel;
  enableFileLogging: boolean;
  logFilePath: string;
  timestampFormat: "locale" | "iso";
  showCallerInfo: boolean;
  callerPathDepth: number; // Number of path components to show in caller info
};

// Default configuration
const config: LoggerConfig = {
  minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
  enableFileLogging: process.env.LOG_TO_FILE === "true",
  logFilePath: path.join(__dirname, "../..", "logs/bot.log"),
  timestampFormat: "locale",
  showCallerInfo: true,
  callerPathDepth: 2, // Show up to 2 parts of the path by default
};

// Formats the current timestamp based on configuration
const formatTime = () => {
  return config.timestampFormat === "locale"
    ? new Date().toLocaleTimeString()
    : new Date().toISOString();
};

// Gets caller information for better debugging
const getCallerInfo = () => {
  if (!config.showCallerInfo) return "";

  const err = new Error();
  const stack = err.stack?.split("\n");
  // Get the caller of the log function (index 3 or 4 in the stack trace)
  const callerLine = stack?.[4] || stack?.[3] || "";
  const callerMatch =
    callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) ||
    callerLine.match(/at\s+()(.*):(\d+):(\d+)/);

  if (!callerMatch) return "";

  const [, , filePath, line] = callerMatch;
  // Get the last 2 parts of the path for better context
  const filePathParts = filePath?.split(/[/\\]/) || [];
  const pathDepth = Math.min(config.callerPathDepth, filePathParts.length);

  // Create path with the last N directory components
  let displayPath = "";
  if (pathDepth > 1) {
    // Get last N path parts (includes directories + filename)
    const relevantParts = filePathParts.slice(-pathDepth);
    displayPath = relevantParts.join("/");
  } else {
    // Fallback to just filename if we don't have enough path parts
    displayPath = filePathParts[filePathParts.length - 1];
  }

  return `[${displayPath}:${line}]`;
};

// Improved message formatting including better object handling
const formatMessage = (...args: unknown[]) => {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack || ""}`;
      } else if (typeof arg === "object") {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      } else {
        return String(arg);
      }
    })
    .join(" ");
};

// Writes log to file if enabled
const writeToFile = (message: string) => {
  if (!config.enableFileLogging) return;

  try {
    // Ensure the directory exists
    const logDir = path.dirname(config.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(config.logFilePath, message + "\n");
  } catch (err: any) {
    console.error(`Failed to write to log file: ${err.message}`);
  }
};

const log = Object.assign(
  (...args: unknown[]) => {
    log.info(...args);
  },
  {
    info: (...args: unknown[]) => {
      if (config.minLevel > LogLevel.INFO) return;

      const callerInfo = getCallerInfo();
      const message = `${colors.dim}[${formatTime()}]${colors.reset} ${colors.info}[INFO]${
        colors.reset
      } ${callerInfo} ${formatMessage(...args)}`;

      console.info(message);
      writeToFile(message.replace(/\x1b\[\d+m/g, "")); // Strip ANSI colors for file
    },
    warn: (...args: unknown[]) => {
      if (config.minLevel > LogLevel.WARN) return;

      const callerInfo = getCallerInfo();
      const message = `${colors.dim}[${formatTime()}]${colors.reset} ${colors.warn}[WARN]${
        colors.reset
      } ${callerInfo} ${formatMessage(...args)}`;

      console.warn(message);
      writeToFile(message.replace(/\x1b\[\d+m/g, ""));
    },
    error: (...args: unknown[]) => {
      if (config.minLevel > LogLevel.ERROR) return;

      const callerInfo = getCallerInfo();
      const message = `${colors.dim}[${formatTime()}]${colors.reset} ${colors.error}[ERROR]${
        colors.reset
      } ${callerInfo} ${formatMessage(...args)}`;

      console.error(message);
      writeToFile(message.replace(/\x1b\[\d+m/g, ""));

      // Log raw error objects for detailed information
      const errorObjects = args.filter((arg) => arg instanceof Error);
      if (errorObjects.length > 0) {
        console.error("Detailed Errors:", errorObjects);
      }
    },
    debug: (...args: unknown[]) => {
      if (config.minLevel > LogLevel.DEBUG) return;

      const callerInfo = getCallerInfo();
      const message = `${colors.dim}[${formatTime()}]${colors.reset} ${colors.debug}[DEBUG]${
        colors.reset
      } ${callerInfo} ${formatMessage(...args)}`;

      console.debug(message);
      writeToFile(message.replace(/\x1b\[\d+m/g, ""));
    },
    /**
     * Configure logger settings
     */ configure: (newConfig: Partial<LoggerConfig>) => {
      Object.assign(config, newConfig);
      // Log configuration status after configuration
      console.log(
        "\x1b[32m%s\x1b[0m",
        `\nLogging configured:
        Debug logging is ${config.minLevel <= LogLevel.DEBUG ? "enabled" : "disabled"}
        File logging is ${config.enableFileLogging ? "enabled" : "disabled"}
        Log level: ${LogLevel[config.minLevel]}
        Log path: ${config.logFilePath}
        Timestamp format: ${config.timestampFormat}
        Caller info: ${config.showCallerInfo ? "enabled" : "disabled"}
        Caller path depth: ${config.callerPathDepth}\n`
      );
    },
    /**
     * Get current logger configuration
     */
    getConfig: (): LoggerConfig => {
      return { ...config };
    },
    /**
     * Log levels enum for configuration
     */
    LogLevel,
  }
);

export default log;

// Initialization message will be shown when configure is called
