/**
 * Heimdall v1 Core Logger
 * Enhanced logging utility with colored output and file logging support
 * Format: [time] [packagename] [LEVEL] [location]: message
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Log levels for filtering output
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** The package/module name shown in logs */
  packageName: string;
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Enable file logging */
  enableFileLogging: boolean;
  /** Path to log file */
  logFilePath?: string;
  /** Timestamp format */
  timestampFormat: "locale" | "iso";
  /** Show caller file and line info */
  showCallerInfo: boolean;
  /** Number of path components to show in caller info */
  callerPathDepth: number;
  /** Enable colored console output */
  enableColors: boolean;
}

// ANSI color codes for terminal output
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
  showCallerInfo: false,
  callerPathDepth: 2,
  enableColors: true,
};

/**
 * Logger class for structured logging output
 */
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

  /**
   * Format the current timestamp
   */
  private formatTime(): string {
    return this.config.timestampFormat === "locale" ? new Date().toLocaleTimeString() : new Date().toISOString();
  }

  /**
   * Get caller information for debugging
   */
  private getCallerInfo(): string {
    if (!this.config.showCallerInfo) return "";

    const err = new Error();
    const stack = err.stack?.split("\n");
    // Get the caller of the log function (index 3 or 4 in the stack trace)
    const callerLine = stack?.[4] || stack?.[3] || "";
    const callerMatch = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || callerLine.match(/at\s+()(.*):(\d+):(\d+)/);

    if (!callerMatch) return "";

    const [, , filePath, line] = callerMatch;
    const filePathParts = filePath?.split(/[/\\]/) || [];
    const pathDepth = Math.min(this.config.callerPathDepth, filePathParts.length);

    let displayPath = "";
    if (pathDepth > 1) {
      const relevantParts = filePathParts.slice(-pathDepth);
      displayPath = relevantParts.join("/");
    } else {
      displayPath = filePathParts[filePathParts.length - 1] || "";
    }

    return `[${displayPath}:${line}]`;
  }

  /**
   * Format message arguments for output
   */
  private formatMessage(...args: unknown[]): string {
    return args
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack || ""}`;
        } else if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        } else {
          return String(arg);
        }
      })
      .join(" ");
  }

  /**
   * Write log to file if enabled
   */
  private writeToFile(message: string): void {
    if (!this.config.enableFileLogging || !this.config.logFilePath) return;

    try {
      const logDir = path.dirname(this.config.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Strip ANSI colors for file logging
      const cleanMessage = message.replace(/\x1b\[\d+m/g, "");
      fs.appendFileSync(this.config.logFilePath, cleanMessage + "\n");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to write to log file: ${errorMessage}`);
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, levelName: string, color: string, ...args: unknown[]): void {
    if (this.config.minLevel > level) return;

    const timestamp = this.formatTime();
    const callerInfo = this.getCallerInfo();
    const formattedMessage = this.formatMessage(...args);

    let message: string;

    if (this.config.enableColors) {
      message = `${colors.dim}[${timestamp}]${colors.reset} ${colors.blue}[${this.config.packageName}]${colors.reset} ${color}[${levelName}]${colors.reset} ${colors.dim}${callerInfo}${colors.reset}: ${formattedMessage}`;
    } else {
      message = `[${timestamp}] [${this.config.packageName}] [${levelName}] ${callerInfo}: ${formattedMessage}`;
    }

    // Output to appropriate console method
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

  /**
   * Log an info message
   */
  info(...args: unknown[]): void {
    this.log(LogLevel.INFO, "INFO", colors.cyan, ...args);
  }

  /**
   * Log a warning message
   */
  warn(...args: unknown[]): void {
    this.log(LogLevel.WARN, "WARN", colors.yellow, ...args);
  }

  /**
   * Log an error message
   */
  error(...args: unknown[]): void {
    this.log(LogLevel.ERROR, "ERROR", colors.red, ...args);
  }

  /**
   * Log a debug message
   */
  debug(...args: unknown[]): void {
    this.log(LogLevel.DEBUG, "DEBUG", colors.magenta, ...args);
  }

  /**
   * Update logger configuration
   */
  configure(newConfig: Partial<LoggerConfig>): void {
    Object.assign(this.config, newConfig);
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

/**
 * Logger interface type for the callable logger function
 */
export interface LoggerFunction {
  (...args: unknown[]): void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  configure: (newConfig: Partial<LoggerConfig>) => void;
  getConfig: () => LoggerConfig;
  child: (childPackageName: string) => LoggerFunction;
  LogLevel: typeof LogLevel;
}

/**
 * Create a new logger instance
 * @param packageName - Name shown in log output
 * @param config - Optional configuration overrides
 * @returns Callable logger function with methods
 */
export function createLogger(packageName: string, config?: Partial<LoggerConfig>): LoggerFunction {
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
