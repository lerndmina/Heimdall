/**
 * Enhanced shared logging utility for Heimdall packages
 * Format: [time] [packagename] [LEVEL] [location]: message
 */

import * as fs from "fs";
import * as path from "path";

// Define log levels as an enum for better type safety
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Logger configuration
export interface LoggerConfig {
  packageName: string; // The package name (bot, handler, etc.)
  minLevel: LogLevel;
  enableFileLogging: boolean;
  logFilePath?: string;
  timestampFormat: "locale" | "iso";
  showCallerInfo: boolean;
  callerPathDepth: number; // Number of path components to show in caller info
  enableColors: boolean;
}

// Color configuration for different log levels
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
};

// Default configuration
const defaultConfig: Partial<LoggerConfig> = {
  minLevel: LogLevel.INFO,
  enableFileLogging: false,
  timestampFormat: "locale",
  showCallerInfo: true,
  callerPathDepth: 2,
  enableColors: true,
};

class Logger {
  private config: LoggerConfig;

  constructor(packageName: string, initialConfig?: Partial<LoggerConfig>) {
    this.config = {
      packageName,
      ...defaultConfig,
      ...initialConfig,
    } as LoggerConfig;

    // Set default log file path if not provided
    if (!this.config.logFilePath) {
      this.config.logFilePath = path.join(process.cwd(), `logs/${packageName}.log`);
    }
  }

  // Formats the current timestamp based on configuration
  private formatTime(): string {
    return this.config.timestampFormat === "locale" ? new Date().toLocaleTimeString() : new Date().toISOString();
  }

  // Gets caller information for better debugging
  private getCallerInfo(): string {
    if (!this.config.showCallerInfo) return "";

    const err = new Error();
    const stack = err.stack?.split("\n");
    // Get the caller of the log function (index 3 or 4 in the stack trace)
    const callerLine = stack?.[4] || stack?.[3] || "";
    const callerMatch = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || callerLine.match(/at\s+()(.*):(\d+):(\d+)/);

    if (!callerMatch) return "";

    const [, , filePath, line] = callerMatch;
    // Get the last 2 parts of the path for better context
    const filePathParts = filePath?.split(/[/\\]/) || [];
    const pathDepth = Math.min(this.config.callerPathDepth, filePathParts.length);

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
  }

  // Improved message formatting including better object handling
  private formatMessage(...args: unknown[]): string {
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
  }

  // Writes log to file if enabled
  private writeToFile(message: string): void {
    if (!this.config.enableFileLogging || !this.config.logFilePath) return;

    try {
      // Ensure the directory exists
      const logDir = path.dirname(this.config.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Strip ANSI colors for file logging
      const cleanMessage = message.replace(/\x1b\[\d+m/g, "");
      fs.appendFileSync(this.config.logFilePath, cleanMessage + "\n");
    } catch (err: any) {
      console.error(`Failed to write to log file: ${err.message}`);
    }
  }

  // Core logging method
  private log(level: LogLevel, levelName: string, color: string, ...args: unknown[]): void {
    if (this.config.minLevel > level) return;

    const timestamp = this.formatTime();
    const callerInfo = this.getCallerInfo();
    const formattedMessage = this.formatMessage(...args);

    // Format: [time] [packagename] [LEVEL] [location]: message
    let message: string;

    if (this.config.enableColors) {
      message = `${colors.dim}[${timestamp}]${colors.reset} ${colors.blue}[${this.config.packageName}]${colors.reset} ${color}[${levelName}]${colors.reset} ${colors.dim}${callerInfo}${colors.reset}: ${formattedMessage}`;
    } else {
      message = `[${timestamp}] [${this.config.packageName}] [${levelName}] ${callerInfo}: ${formattedMessage}`;
    }

    // Output to console
    const outputMethod = level === LogLevel.ERROR ? console.error : level === LogLevel.WARN ? console.warn : level === LogLevel.DEBUG ? console.debug : console.log;

    outputMethod(message);
    this.writeToFile(message);

    // Log raw error objects for detailed information
    if (level === LogLevel.ERROR) {
      const errorObjects = args.filter((arg) => arg instanceof Error);
      if (errorObjects.length > 0) {
        console.error("Detailed Errors:", errorObjects);
      }
    }
  }

  // Public logging methods
  info(...args: unknown[]): void {
    this.log(LogLevel.INFO, "INFO", colors.cyan, ...args);
  }

  warn(...args: unknown[]): void {
    this.log(LogLevel.WARN, "WARN", colors.yellow, ...args);
  }

  error(...args: unknown[]): void {
    this.log(LogLevel.ERROR, "ERROR", colors.red, ...args);
  }

  debug(...args: unknown[]): void {
    this.log(LogLevel.DEBUG, "DEBUG", colors.magenta, ...args);
  }

  /**
   * Configure logger settings
   */
  configure(newConfig: Partial<LoggerConfig>): void {
    Object.assign(this.config, newConfig);

    // Log configuration status after configuration
    const configMessage = `
Logging configured:
        Package: ${this.config.packageName}
        Debug logging is ${this.config.minLevel <= LogLevel.DEBUG ? "enabled" : "disabled"}
        File logging is ${this.config.enableFileLogging ? "enabled" : "disabled"}
        Log level: ${LogLevel[this.config.minLevel]}
        Log path: ${this.config.logFilePath}
        Timestamp format: ${this.config.timestampFormat}
        Caller info: ${this.config.showCallerInfo ? "enabled" : "disabled"}
        Caller path depth: ${this.config.callerPathDepth}
        Colors: ${this.config.enableColors ? "enabled" : "disabled"}
`;

    if (this.config.enableColors) {
      console.log(colors.green + configMessage + colors.reset);
    } else {
      console.log(configMessage);
    }
  }

  /**
   * Get current logger configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Create a child logger with the same configuration but different package name
   */
  child(packageName: string): Logger {
    return new Logger(packageName, { ...this.config, packageName });
  }
}

// Create a callable logger function that maintains the same interface as the original
export function createLogger(packageName: string, config?: Partial<LoggerConfig>) {
  const logger = new Logger(packageName, config);

  // Create a callable function that delegates to info method
  const loggerFunction = Object.assign((...args: unknown[]) => logger.info(...args), {
    info: (...args: unknown[]) => logger.info(...args),
    warn: (...args: unknown[]) => logger.warn(...args),
    error: (...args: unknown[]) => logger.error(...args),
    debug: (...args: unknown[]) => logger.debug(...args),
    configure: (newConfig: Partial<LoggerConfig>) => logger.configure(newConfig),
    getConfig: () => logger.getConfig(),
    child: (childPackageName: string) => createLogger(childPackageName, logger.getConfig()),
    LogLevel,
  });

  return loggerFunction;
}

// Export the Logger class for direct instantiation if needed
export { Logger };
