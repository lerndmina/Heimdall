export interface AnalyticsConfig {
  enabled: boolean;
  collectUsageStats: boolean;
  collectPerformanceMetrics: boolean;
  collectErrorStats: boolean;
  retentionDays: number;
  exportFormat: "json" | "csv" | "both";
  exportPath?: string;
  enableRealTimeStats: boolean;
  aggregationInterval: number; // minutes
}

export interface CommandUsageMetric {
  commandName: string;
  userId: string;
  guildId?: string;
  timestamp: Date;
  executionTime: number;
  success: boolean;
  errorType?: string;
  parameters?: Record<string, any>;
}

export interface PerformanceMetric {
  metricType: "command_execution" | "middleware_execution" | "validation_execution" | "hot_reload";
  identifier: string;
  timestamp: Date;
  duration: number;
  memoryUsage?: number;
  cpuUsage?: number;
  metadata?: Record<string, any>;
}

export interface ErrorMetric {
  errorType: string;
  errorMessage: string;
  commandName?: string;
  userId?: string;
  guildId?: string;
  timestamp: Date;
  stackTrace?: string;
  context?: Record<string, any>;
}

export interface UsageStats {
  totalCommands: number;
  uniqueUsers: number;
  uniqueGuilds: number;
  commandFrequency: Record<string, number>;
  errorRate: number;
  averageExecutionTime: number;
  peakUsageHour: number;
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface PerformanceStats {
  averageExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
  totalExecutions: number;
  slowestCommand: {
    name: string;
    time: number;
  };
  fastestCommand: {
    name: string;
    time: number;
  };
  memoryUsageStats: {
    average: number;
    peak: number;
    current: number;
  };
}

export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByCommand: Record<string, number>;
  errorRate: number;
  mostCommonError: {
    type: string;
    count: number;
  };
  errorTrends: Array<{
    date: Date;
    count: number;
  }>;
}

export interface AnalyticsReport {
  generatedAt: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
  usage: UsageStats;
  performance: PerformanceStats;
  errors: ErrorStats;
  metadata: {
    version: string;
    totalDataPoints: number;
    reportFormat: string;
  };
}

export interface AnalyticsEvent {
  type: "usage" | "performance" | "error" | "report_generated";
  timestamp: Date;
  data: CommandUsageMetric | PerformanceMetric | ErrorMetric | AnalyticsReport;
}
