export interface HotReloadConfig {
  enabled: boolean;
  watchMode: "development" | "always" | "never";
  watchDelay: number; // Debounce delay in milliseconds
  watchIgnorePatterns: string[];
  enableEventEmission: boolean;
  enableRollback: boolean;
  maxReloadAttempts: number;
}

export interface FileWatchEvent {
  type: "changed" | "added" | "removed";
  filePath: string;
  timestamp: Date;
}

export interface HotReloadEvent {
  type: "reload_start" | "reload_success" | "reload_failure" | "watch_start" | "watch_stop";
  commandName?: string;
  filePath?: string;
  error?: string;
  timestamp: Date;
  reloadTime?: number;
}

export interface ReloadQueueItem {
  filePath: string;
  commandName: string;
  attempts: number;
  lastAttempt: Date;
  backupVersion?: any;
}

export interface WatchOptions {
  recursive: boolean;
  includeExtensions: string[];
  excludePatterns: string[];
}

export interface ModuleDependency {
  modulePath: string;
  dependents: string[];
  lastModified: Date;
}
