import { EventEmitter } from "events";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import type { CommandHandler } from "../CommandHandler";
import type { AnalyticsConfig, CommandUsageMetric, PerformanceMetric, ErrorMetric, UsageStats, PerformanceStats, ErrorStats, AnalyticsReport, AnalyticsEvent } from "../types/Analytics";

export class AnalyticsCollector extends EventEmitter {
  private handler: CommandHandler;
  private config: AnalyticsConfig;
  private usageMetrics: CommandUsageMetric[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private errorMetrics: ErrorMetric[] = [];
  private aggregationTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(handler: CommandHandler, config: Partial<AnalyticsConfig> = {}) {
    super();
    this.handler = handler;
    this.config = {
      enabled: true,
      collectUsageStats: true,
      collectPerformanceMetrics: true,
      collectErrorStats: true,
      retentionDays: 30,
      exportFormat: "json",
      enableRealTimeStats: false,
      aggregationInterval: 60, // 1 hour
      ...config,
    };

    if (this.config.enabled) {
      this.startAggregation();
      this.startCleanupTimer();
    }
  }

  public recordCommandUsage(commandName: string, userId: string, guildId: string | undefined, executionTime: number, success: boolean, errorType?: string, parameters?: Record<string, any>): void {
    if (!this.config.enabled || !this.config.collectUsageStats) {
      return;
    }

    const metric: CommandUsageMetric = {
      commandName,
      userId,
      guildId,
      timestamp: new Date(),
      executionTime,
      success,
      errorType,
      parameters: parameters ? this.sanitizeParameters(parameters) : undefined,
    };

    this.usageMetrics.push(metric);
    this.emitEvent("usage", metric);
  }

  public recordPerformanceMetric(metricType: PerformanceMetric["metricType"], identifier: string, duration: number, metadata?: Record<string, any>): void {
    if (!this.config.enabled || !this.config.collectPerformanceMetrics) {
      return;
    }

    const metric: PerformanceMetric = {
      metricType,
      identifier,
      timestamp: new Date(),
      duration,
      memoryUsage: this.getMemoryUsage(),
      metadata,
    };

    this.performanceMetrics.push(metric);
    this.emitEvent("performance", metric);
  }

  public recordError(errorType: string, errorMessage: string, commandName?: string, userId?: string, guildId?: string, stackTrace?: string, context?: Record<string, any>): void {
    if (!this.config.enabled || !this.config.collectErrorStats) {
      return;
    }

    const metric: ErrorMetric = {
      errorType,
      errorMessage,
      commandName,
      userId,
      guildId,
      timestamp: new Date(),
      stackTrace,
      context,
    };

    this.errorMetrics.push(metric);
    this.emitEvent("error", metric);
  }

  public async generateReport(startDate?: Date, endDate?: Date): Promise<AnalyticsReport> {
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    const end = endDate || now;

    const usageStats = this.calculateUsageStats(start, end);
    const performanceStats = this.calculatePerformanceStats(start, end);
    const errorStats = this.calculateErrorStats(start, end);

    const report: AnalyticsReport = {
      generatedAt: now,
      timeRange: { start, end },
      usage: usageStats,
      performance: performanceStats,
      errors: errorStats,
      metadata: {
        version: "1.0.0",
        totalDataPoints: this.usageMetrics.length + this.performanceMetrics.length + this.errorMetrics.length,
        reportFormat: this.config.exportFormat,
      },
    };

    this.emitEvent("report_generated", report);
    return report;
  }

  public async exportReport(report: AnalyticsReport, filename?: string): Promise<string> {
    if (!this.config.exportPath) {
      throw new Error("Export path not configured");
    }

    // Ensure export directory exists
    if (!existsSync(this.config.exportPath)) {
      await mkdir(this.config.exportPath, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseFilename = filename || `analytics-report-${timestamp}`;

    let exportedFiles: string[] = [];

    if (this.config.exportFormat === "json" || this.config.exportFormat === "both") {
      const jsonPath = join(this.config.exportPath, `${baseFilename}.json`);
      await writeFile(jsonPath, JSON.stringify(report, null, 2));
      exportedFiles.push(jsonPath);
    }

    if (this.config.exportFormat === "csv" || this.config.exportFormat === "both") {
      const csvPath = join(this.config.exportPath, `${baseFilename}.csv`);
      const csvContent = this.convertReportToCSV(report);
      await writeFile(csvPath, csvContent);
      exportedFiles.push(csvPath);
    }

    return exportedFiles.join(", ");
  }

  public getUsageStats(timeRange?: { start: Date; end: Date }): UsageStats {
    const start = timeRange?.start || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = timeRange?.end || new Date();
    return this.calculateUsageStats(start, end);
  }

  public getPerformanceStats(timeRange?: { start: Date; end: Date }): PerformanceStats {
    const start = timeRange?.start || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = timeRange?.end || new Date();
    return this.calculatePerformanceStats(start, end);
  }

  public getErrorStats(timeRange?: { start: Date; end: Date }): ErrorStats {
    const start = timeRange?.start || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = timeRange?.end || new Date();
    return this.calculateErrorStats(start, end);
  }

  public clearMetrics(): void {
    this.usageMetrics = [];
    this.performanceMetrics = [];
    this.errorMetrics = [];
  }

  public getMetricsCounts(): {
    usage: number;
    performance: number;
    errors: number;
  } {
    return {
      usage: this.usageMetrics.length,
      performance: this.performanceMetrics.length,
      errors: this.errorMetrics.length,
    };
  }

  private calculateUsageStats(start: Date, end: Date): UsageStats {
    const filteredUsage = this.usageMetrics.filter((metric) => metric.timestamp >= start && metric.timestamp <= end);

    const uniqueUsers = new Set(filteredUsage.map((m) => m.userId)).size;
    const uniqueGuilds = new Set(filteredUsage.map((m) => m.guildId).filter(Boolean)).size;

    const commandFrequency: Record<string, number> = {};
    const hourlyUsage: Record<number, number> = {};

    let totalExecutionTime = 0;
    let errorCount = 0;

    for (const metric of filteredUsage) {
      commandFrequency[metric.commandName] = (commandFrequency[metric.commandName] || 0) + 1;

      const hour = metric.timestamp.getHours();
      hourlyUsage[hour] = (hourlyUsage[hour] || 0) + 1;

      totalExecutionTime += metric.executionTime;

      if (!metric.success) {
        errorCount++;
      }
    }

    const peakUsageHour = Object.entries(hourlyUsage).reduce((peak, [hour, count]) => (count > peak.count ? { hour: parseInt(hour), count } : peak), { hour: 0, count: 0 }).hour;

    return {
      totalCommands: filteredUsage.length,
      uniqueUsers,
      uniqueGuilds,
      commandFrequency,
      errorRate: filteredUsage.length > 0 ? errorCount / filteredUsage.length : 0,
      averageExecutionTime: filteredUsage.length > 0 ? totalExecutionTime / filteredUsage.length : 0,
      peakUsageHour,
      timeRange: { start, end },
    };
  }

  private calculatePerformanceStats(start: Date, end: Date): PerformanceStats {
    const filteredPerformance = this.performanceMetrics.filter((metric) => metric.timestamp >= start && metric.timestamp <= end);

    if (filteredPerformance.length === 0) {
      return {
        averageExecutionTime: 0,
        p95ExecutionTime: 0,
        p99ExecutionTime: 0,
        totalExecutions: 0,
        slowestCommand: { name: "N/A", time: 0 },
        fastestCommand: { name: "N/A", time: 0 },
        memoryUsageStats: { average: 0, peak: 0, current: this.getMemoryUsage() },
      };
    }

    const durations = filteredPerformance.map((m) => m.duration).sort((a, b) => a - b);
    const memoryUsages = filteredPerformance.map((m) => m.memoryUsage).filter(Boolean) as number[];

    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    const slowest = filteredPerformance.reduce((prev, curr) => (curr.duration > prev.duration ? curr : prev));
    const fastest = filteredPerformance.reduce((prev, curr) => (curr.duration < prev.duration ? curr : prev));

    return {
      averageExecutionTime: durations.reduce((a, b) => a + b) / durations.length,
      p95ExecutionTime: durations[p95Index] || 0,
      p99ExecutionTime: durations[p99Index] || 0,
      totalExecutions: filteredPerformance.length,
      slowestCommand: { name: slowest.identifier, time: slowest.duration },
      fastestCommand: { name: fastest.identifier, time: fastest.duration },
      memoryUsageStats: {
        average: memoryUsages.length > 0 ? memoryUsages.reduce((a, b) => a + b) / memoryUsages.length : 0,
        peak: memoryUsages.length > 0 ? Math.max(...memoryUsages) : 0,
        current: this.getMemoryUsage(),
      },
    };
  }

  private calculateErrorStats(start: Date, end: Date): ErrorStats {
    const filteredErrors = this.errorMetrics.filter((metric) => metric.timestamp >= start && metric.timestamp <= end);

    const errorsByType: Record<string, number> = {};
    const errorsByCommand: Record<string, number> = {};
    const dailyErrors: Array<{ date: Date; count: number }> = [];

    for (const error of filteredErrors) {
      errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;

      if (error.commandName) {
        errorsByCommand[error.commandName] = (errorsByCommand[error.commandName] || 0) + 1;
      }
    }

    // Calculate daily error trends
    const errorsByDate: Record<string, number> = {};
    for (const error of filteredErrors) {
      const dateKey = error.timestamp.toISOString().split("T")[0];
      errorsByDate[dateKey] = (errorsByDate[dateKey] || 0) + 1;
    }

    for (const [dateKey, count] of Object.entries(errorsByDate)) {
      dailyErrors.push({ date: new Date(dateKey), count });
    }

    const mostCommonErrorType = Object.entries(errorsByType).reduce((prev, [type, count]) => (count > prev.count ? { type, count } : prev), { type: "None", count: 0 });

    const totalUsageInPeriod = this.usageMetrics.filter((metric) => metric.timestamp >= start && metric.timestamp <= end).length;

    return {
      totalErrors: filteredErrors.length,
      errorsByType,
      errorsByCommand,
      errorRate: totalUsageInPeriod > 0 ? filteredErrors.length / totalUsageInPeriod : 0,
      mostCommonError: mostCommonErrorType,
      errorTrends: dailyErrors.sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
  }

  private sanitizeParameters(parameters: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(parameters)) {
      // Remove sensitive information
      if (typeof value === "string" && value.length > 100) {
        sanitized[key] = `[${value.length} chars]`;
      } else if (key.toLowerCase().includes("token") || key.toLowerCase().includes("password")) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private getMemoryUsage(): number {
    return process.memoryUsage().heapUsed / 1024 / 1024; // MB
  }

  private convertReportToCSV(report: AnalyticsReport): string {
    const lines: string[] = [];

    // Header
    lines.push("Category,Metric,Value");

    // Usage stats
    lines.push(`Usage,Total Commands,${report.usage.totalCommands}`);
    lines.push(`Usage,Unique Users,${report.usage.uniqueUsers}`);
    lines.push(`Usage,Unique Guilds,${report.usage.uniqueGuilds}`);
    lines.push(`Usage,Error Rate,${(report.usage.errorRate * 100).toFixed(2)}%`);
    lines.push(`Usage,Average Execution Time,${report.usage.averageExecutionTime.toFixed(2)}ms`);

    // Performance stats
    lines.push(`Performance,Average Execution Time,${report.performance.averageExecutionTime.toFixed(2)}ms`);
    lines.push(`Performance,P95 Execution Time,${report.performance.p95ExecutionTime.toFixed(2)}ms`);
    lines.push(`Performance,P99 Execution Time,${report.performance.p99ExecutionTime.toFixed(2)}ms`);
    lines.push(`Performance,Total Executions,${report.performance.totalExecutions}`);

    // Error stats
    lines.push(`Errors,Total Errors,${report.errors.totalErrors}`);
    lines.push(`Errors,Error Rate,${(report.errors.errorRate * 100).toFixed(2)}%`);
    lines.push(`Errors,Most Common Error,${report.errors.mostCommonError.type}`);

    return lines.join("\n");
  }

  private startAggregation(): void {
    if (this.config.aggregationInterval <= 0) {
      return;
    }

    this.aggregationTimer = setInterval(() => {
      this.performAggregation();
    }, this.config.aggregationInterval * 60 * 1000); // Convert minutes to milliseconds
  }

  private startCleanupTimer(): void {
    // Run cleanup every 24 hours
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, 24 * 60 * 60 * 1000);
  }

  private async performAggregation(): Promise<void> {
    try {
      const report = await this.generateReport();

      if (this.config.exportPath) {
        await this.exportReport(report);
      }

      if (this.config.enableRealTimeStats) {
        this.emit("aggregation", report);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  private cleanupOldMetrics(): void {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);

    this.usageMetrics = this.usageMetrics.filter((metric) => metric.timestamp > cutoffDate);
    this.performanceMetrics = this.performanceMetrics.filter((metric) => metric.timestamp > cutoffDate);
    this.errorMetrics = this.errorMetrics.filter((metric) => metric.timestamp > cutoffDate);
  }

  private emitEvent(type: AnalyticsEvent["type"], data: any): void {
    if (this.config.enableRealTimeStats) {
      this.emit("analytics", {
        type,
        timestamp: new Date(),
        data,
      } as AnalyticsEvent);
    }
  }

  public getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AnalyticsConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart timers if needed
    if (this.config.enabled) {
      if (!this.aggregationTimer) {
        this.startAggregation();
      }
      if (!this.cleanupTimer) {
        this.startCleanupTimer();
      }
    } else {
      this.dispose();
    }
  }

  public async dispose(): Promise<void> {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.removeAllListeners();
  }
}
