/**
 * API Health Checker Service
 *
 * Monitors the bot's API server health and performs panic shutdown if the API becomes unresponsive.
 *
 * Environment Variables (all optional):
 * - HEALTH_CHECK_INTERVAL_MS: How often to check (default: 30000ms = 30 seconds)
 * - MAX_CONSECUTIVE_FAILURES: Max failures before panic (default: 3)
 * - HEALTH_CHECK_TIMEOUT_MS: Request timeout (default: 5000ms = 5 seconds)
 *
 * The health checker will:
 * 1. Monitor the API server's /api/health endpoint
 * 2. Track response times and failure rates
 * 3. Log detailed panic information to console
 * 4. Terminate the process if consecutive failures exceed the threshold
 *
 * This ensures the bot doesn't run with a broken API server that would prevent
 * the dashboard from functioning properly.
 */

import log from "../utils/log";
import FetchEnvs from "../utils/FetchEnvs";

const env = FetchEnvs();

interface HealthCheckResult {
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
  timestamp: Date;
}

interface HealthCheckStats {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  averageResponseTime: number;
  lastSuccessTime?: Date;
  lastFailureTime?: Date;
  consecutiveFailures: number;
}

export class ApiHealthChecker {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private stats: HealthCheckStats = {
    totalChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    averageResponseTime: 0,
    consecutiveFailures: 0,
  };

  private readonly apiUrl: string;
  private readonly checkIntervalMs: number;
  private readonly maxConsecutiveFailures: number;
  private readonly timeoutMs: number;

  constructor() {
    this.apiUrl = `http://localhost:${env.API_PORT}/api/health`;
    this.checkIntervalMs = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || "30000"); // 30 seconds default
    this.maxConsecutiveFailures = parseInt(process.env.MAX_CONSECUTIVE_FAILURES || "3"); // 3 failures before panic
    this.timeoutMs = parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || "5000"); // 5 second timeout
  }

  public start(): void {
    if (this.isRunning) {
      log.warn("Health checker is already running");
      return;
    }

    this.isRunning = true;
    log.info("Starting API health checker", {
      apiUrl: this.apiUrl,
      checkIntervalMs: this.checkIntervalMs,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      timeoutMs: this.timeoutMs,
    });

    // Run initial check immediately
    this.performHealthCheck();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.checkIntervalMs);
  }

  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    log.info("API health checker stopped");
  }

  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();
    const timestamp = new Date();

    try {
      log.debug("Performing health check", { url: this.apiUrl });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(this.apiUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Heimdall-HealthChecker/1.0",
        },
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      const result: HealthCheckResult = {
        success: response.ok,
        responseTime,
        statusCode: response.status,
        timestamp,
      };

      if (response.ok) {
        this.handleSuccessfulCheck(result);
      } else {
        result.error = `HTTP ${response.status} ${response.statusText}`;
        this.handleFailedCheck(result);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result: HealthCheckResult = {
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
        timestamp,
      };

      this.handleFailedCheck(result);
    }
  }

  private handleSuccessfulCheck(result: HealthCheckResult): void {
    this.stats.totalChecks++;
    this.stats.successfulChecks++;
    this.stats.lastSuccessTime = result.timestamp;
    this.stats.consecutiveFailures = 0;

    // Update average response time
    this.updateAverageResponseTime(result.responseTime);

    log.debug("Health check successful", {
      responseTime: `${result.responseTime}ms`,
      statusCode: result.statusCode,
      stats: this.getStatsSnapshot(),
    });
  }

  private handleFailedCheck(result: HealthCheckResult): void {
    this.stats.totalChecks++;
    this.stats.failedChecks++;
    this.stats.lastFailureTime = result.timestamp;
    this.stats.consecutiveFailures++;

    // Update average response time
    this.updateAverageResponseTime(result.responseTime);

    log.error("Health check failed", {
      error: result.error,
      responseTime: `${result.responseTime}ms`,
      statusCode: result.statusCode,
      consecutiveFailures: this.stats.consecutiveFailures,
      stats: this.getStatsSnapshot(),
    });

    // Check if we should panic
    if (this.stats.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.panic(result);
    }
  }

  private updateAverageResponseTime(responseTime: number): void {
    if (this.stats.totalChecks === 1) {
      this.stats.averageResponseTime = responseTime;
    } else {
      // Calculate rolling average
      this.stats.averageResponseTime =
        (this.stats.averageResponseTime * (this.stats.totalChecks - 1) + responseTime) /
        this.stats.totalChecks;
    }
  }

  private getStatsSnapshot() {
    return {
      totalChecks: this.stats.totalChecks,
      successRate:
        this.stats.totalChecks > 0
          ? ((this.stats.successfulChecks / this.stats.totalChecks) * 100).toFixed(2) + "%"
          : "N/A",
      averageResponseTime: `${Math.round(this.stats.averageResponseTime)}ms`,
      consecutiveFailures: this.stats.consecutiveFailures,
      lastSuccess: this.stats.lastSuccessTime?.toISOString() || "Never",
      lastFailure: this.stats.lastFailureTime?.toISOString() || "Never",
    };
  }

  private panic(lastResult: HealthCheckResult): void {
    const panicTime = new Date().toISOString();
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    console.error("=".repeat(100));
    console.error("🚨 CRITICAL: API SERVER HEALTH CHECK FAILURE - INITIATING PANIC SHUTDOWN 🚨");
    console.error("=".repeat(100));
    console.error("");
    console.error("PANIC DETAILS:");
    console.error(`  Timestamp: ${panicTime}`);
    console.error(
      `  Consecutive Failures: ${this.stats.consecutiveFailures}/${this.maxConsecutiveFailures}`
    );
    console.error(`  Last Error: ${lastResult.error}`);
    console.error(`  Last Status Code: ${lastResult.statusCode || "N/A"}`);
    console.error(`  Last Response Time: ${lastResult.responseTime}ms`);
    console.error("");
    console.error("HEALTH CHECK STATISTICS:");
    console.error(`  Total Checks: ${this.stats.totalChecks}`);
    console.error(
      `  Success Rate: ${((this.stats.successfulChecks / this.stats.totalChecks) * 100).toFixed(
        2
      )}%`
    );
    console.error(`  Failed Checks: ${this.stats.failedChecks}`);
    console.error(`  Average Response Time: ${Math.round(this.stats.averageResponseTime)}ms`);
    console.error(
      `  Last Successful Check: ${this.stats.lastSuccessTime?.toISOString() || "Never"}`
    );
    console.error(`  Last Failed Check: ${this.stats.lastFailureTime?.toISOString() || "Never"}`);
    console.error("");
    console.error("SYSTEM INFORMATION:");
    console.error(`  Process Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`);
    console.error(`  Memory Usage:`);
    console.error(`    RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB`);
    console.error(`    Heap Used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.error(`    Heap Total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`);
    console.error(`    External: ${Math.round(memoryUsage.external / 1024 / 1024)}MB`);
    console.error("");
    console.error("API SERVER CONFIGURATION:");
    console.error(`  Health Check URL: ${this.apiUrl}`);
    console.error(`  Check Interval: ${this.checkIntervalMs}ms`);
    console.error(`  Timeout: ${this.timeoutMs}ms`);
    console.error(`  Max Failures: ${this.maxConsecutiveFailures}`);
    console.error("");
    console.error("ENVIRONMENT VARIABLES:");
    console.error(`  NODE_ENV: ${process.env.NODE_ENV || "N/A"}`);
    console.error(`  API_PORT: ${env.API_PORT || "N/A"}`);
    console.error(`  BOT_TOKEN: ${env.BOT_TOKEN ? "[REDACTED]" : "NOT SET"}`);
    console.error(`  MONGODB_URI: ${env.MONGODB_URI ? "[REDACTED]" : "NOT SET"}`);
    console.error(`  REDIS_URL: ${env.REDIS_URL ? "[REDACTED]" : "NOT SET"}`);
    console.error("");
    console.error("PROCESS INFORMATION:");
    console.error(`  Process ID: ${process.pid}`);
    console.error(`  Node.js Version: ${process.version}`);
    console.error(`  Platform: ${process.platform}`);
    console.error(`  Architecture: ${process.arch}`);
    console.error(`  Working Directory: ${process.cwd()}`);
    console.error("");
    console.error("RECENT ERRORS (if any):");
    // You could enhance this to store recent error logs
    console.error("  (Error logging enhancement could be added here)");
    console.error("");
    console.error("=".repeat(100));
    console.error("🚨 SHUTTING DOWN PROCESS - API SERVER IS UNRESPONSIVE 🚨");
    console.error("=".repeat(100));

    // Log to the log system as well
    log.error("API Health Check Panic - Process terminating", {
      panicTime,
      consecutiveFailures: this.stats.consecutiveFailures,
      lastError: lastResult.error,
      stats: this.getStatsSnapshot(),
      systemInfo: {
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        memoryUsage,
        processId: process.pid,
        nodeVersion: process.version,
      },
    });

    // Stop the health checker
    this.stop();

    // Give a moment for logs to flush
    setTimeout(() => {
      console.error("🚨 PROCESS TERMINATING NOW 🚨");
      process.exit(1);
    }, 1000);
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      stats: this.getStatsSnapshot(),
      config: {
        apiUrl: this.apiUrl,
        checkIntervalMs: this.checkIntervalMs,
        maxConsecutiveFailures: this.maxConsecutiveFailures,
        timeoutMs: this.timeoutMs,
      },
    };
  }
}

// Export singleton instance
export const healthChecker = new ApiHealthChecker();
