import { EventEmitter } from "events";
import { watch, FSWatcher } from "fs";
import { readdir } from "fs/promises";
import { join, dirname, basename, extname } from "path";
import { existsSync } from "fs";
import type { CommandHandler } from "../CommandHandler";
import type { HotReloadConfig, HotReloadEvent, FileWatchEvent, ReloadQueueItem, ModuleDependency, WatchOptions } from "../types/HotReload";

export class HotReloadSystem extends EventEmitter {
  private handler: CommandHandler;
  private config: HotReloadConfig;
  private watchers: Map<string, FSWatcher> = new Map();
  private reloadQueue: Map<string, ReloadQueueItem> = new Map();
  private moduleDependencies: Map<string, ModuleDependency> = new Map();
  private reloadTimers: Map<string, NodeJS.Timeout> = new Map();
  private isWatching: boolean = false;

  constructor(handler: CommandHandler, config: Partial<HotReloadConfig> = {}) {
    super();
    this.handler = handler;
    this.config = {
      enabled: true,
      watchMode: "development",
      watchDelay: 500,
      watchIgnorePatterns: ["node_modules", ".git", "dist", "build"],
      enableEventEmission: true,
      enableRollback: true,
      maxReloadAttempts: 3,
      ...config,
    };
  }

  public async startWatching(): Promise<void> {
    if (!this.shouldWatch()) {
      return;
    }

    if (this.isWatching) {
      return;
    }

    try {
      // Check if recursive watching is supported on this platform
      if (!this.isRecursiveWatchSupported()) {
        this.emitEvent({
          type: "reload_failure",
          error: "Recursive file watching is not supported on this platform. Hot reload disabled.",
          timestamp: new Date(),
        });
        return;
      }

      const commandsPath = this.handler.getCommandsPath();
      const eventsPath = this.handler.getEventsPath();

      await this.setupWatcher(commandsPath, {
        recursive: true,
        includeExtensions: [".js", ".ts"],
        excludePatterns: this.config.watchIgnorePatterns,
      });

      if (eventsPath) {
        await this.setupWatcher(eventsPath, {
          recursive: true,
          includeExtensions: [".js", ".ts"],
          excludePatterns: this.config.watchIgnorePatterns,
        });
      }

      this.isWatching = true;
      this.emitEvent({
        type: "watch_start",
        timestamp: new Date(),
      });
    } catch (error) {
      this.emitEvent({
        type: "reload_failure",
        error: `Failed to start watching: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  public async stopWatching(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    // Clear all timers
    for (const timer of this.reloadTimers.values()) {
      clearTimeout(timer);
    }
    this.reloadTimers.clear();

    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    this.isWatching = false;
    this.emitEvent({
      type: "watch_stop",
      timestamp: new Date(),
    });
  }

  public async reloadCommand(filePath: string): Promise<boolean> {
    const commandName = this.extractCommandName(filePath);
    if (!commandName) {
      return false;
    }

    const startTime = Date.now();

    this.emitEvent({
      type: "reload_start",
      commandName,
      filePath,
      timestamp: new Date(),
    });

    try {
      // Clear module from cache
      this.clearModuleCache(filePath);

      // Backup current version if rollback is enabled
      let backupVersion;
      if (this.config.enableRollback) {
        backupVersion = this.handler.getCommand(commandName);
      }

      // Remove old command
      this.handler.deleteCommand(commandName);

      // Reload the command
      const command = await this.loadCommandFile(filePath);
      if (command) {
        this.handler.setCommand(commandName, command);

        const reloadTime = Date.now() - startTime;
        this.emitEvent({
          type: "reload_success",
          commandName,
          filePath,
          timestamp: new Date(),
          reloadTime,
        });

        // Remove from reload queue
        this.reloadQueue.delete(filePath);
        return true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.emitEvent({
        type: "reload_failure",
        commandName,
        filePath,
        error: errorMessage,
        timestamp: new Date(),
      });

      // Add to reload queue for retry
      this.addToReloadQueue(filePath, commandName);
      return false;
    }

    return false;
  }

  public invalidateModuleCache(modulePath: string): void {
    this.clearModuleCache(modulePath);
  }

  public getDependencies(modulePath: string): ModuleDependency | undefined {
    return this.moduleDependencies.get(modulePath);
  }

  public getQueueStatus(): ReloadQueueItem[] {
    return Array.from(this.reloadQueue.values());
  }

  public isFileWatched(filePath: string): boolean {
    return Array.from(this.watchers.keys()).some((watchedPath) => filePath.startsWith(watchedPath));
  }

  private shouldWatch(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    switch (this.config.watchMode) {
      case "never":
        return false;
      case "always":
        return true;
      case "development":
        return process.env.NODE_ENV !== "production";
      default:
        return false;
    }
  }

  private isRecursiveWatchSupported(): boolean {
    try {
      // Try to create a test watcher to see if recursive watching is supported
      const testWatcher = watch(".", { recursive: true }, () => {});
      testWatcher.close();
      return true;
    } catch (error) {
      // If we get ERR_FEATURE_UNAVAILABLE_ON_PLATFORM, recursive watching is not supported
      if (error instanceof Error && (error as any).code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") {
        return false;
      }
      // For other errors, assume it's supported but the path doesn't exist
      return true;
    }
  }

  private async setupWatcher(dirPath: string, options: WatchOptions): Promise<void> {
    if (!existsSync(dirPath)) {
      return;
    }

    const watcher = watch(dirPath, { recursive: options.recursive }, (eventType, filename) => {
      if (!filename) return;

      const filePath = join(dirPath, filename);
      const ext = extname(filePath);

      // Check if file extension is included
      if (!options.includeExtensions.includes(ext)) {
        return;
      }

      // Check if file path matches exclude patterns
      if (this.shouldIgnoreFile(filePath, options.excludePatterns)) {
        return;
      }

      this.handleFileChange(eventType, filePath);
    });

    this.watchers.set(dirPath, watcher);
  }

  private shouldIgnoreFile(filePath: string, excludePatterns: string[]): boolean {
    return excludePatterns.some((pattern) => filePath.includes(pattern));
  }

  private handleFileChange(eventType: string, filePath: string): void {
    // Clear existing timer for this file
    const existingTimer = this.reloadTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer with debounce
    const timer = setTimeout(() => {
      this.processFileChange(eventType, filePath);
      this.reloadTimers.delete(filePath);
    }, this.config.watchDelay);

    this.reloadTimers.set(filePath, timer);
  }

  private async processFileChange(eventType: string, filePath: string): Promise<void> {
    const changeType = eventType === "rename" ? "changed" : "changed";

    // Emit file watch event
    this.emit("fileChange", {
      type: changeType,
      filePath,
      timestamp: new Date(),
    } as FileWatchEvent);

    // Only reload if file still exists (not deleted)
    if (existsSync(filePath) && this.isCommandFile(filePath)) {
      await this.reloadCommand(filePath);
    }
  }

  private isCommandFile(filePath: string): boolean {
    const commandsPath = this.handler.getCommandsPath();
    return filePath.startsWith(commandsPath) && (filePath.endsWith(".js") || filePath.endsWith(".ts"));
  }

  private extractCommandName(filePath: string): string | null {
    try {
      const name = basename(filePath, extname(filePath));
      return name;
    } catch {
      return null;
    }
  }

  private clearModuleCache(modulePath: string): void {
    // Clear from Node.js require cache
    delete require.cache[require.resolve(modulePath)];

    // Clear any related dependencies
    const dependency = this.moduleDependencies.get(modulePath);
    if (dependency) {
      for (const dependent of dependency.dependents) {
        delete require.cache[require.resolve(dependent)];
      }
    }
  }

  private async loadCommandFile(filePath: string): Promise<any> {
    try {
      // Dynamic import to bypass cache
      const moduleUrl = `${filePath}?t=${Date.now()}`;
      const command = await import(moduleUrl);
      return command;
    } catch (error) {
      throw new Error(`Failed to load command file ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private addToReloadQueue(filePath: string, commandName: string): void {
    const existing = this.reloadQueue.get(filePath);
    if (existing && existing.attempts >= this.config.maxReloadAttempts) {
      return; // Max attempts reached
    }

    this.reloadQueue.set(filePath, {
      filePath,
      commandName,
      attempts: existing ? existing.attempts + 1 : 1,
      lastAttempt: new Date(),
      backupVersion: existing?.backupVersion,
    });
  }

  private emitEvent(event: HotReloadEvent): void {
    if (this.config.enableEventEmission) {
      this.emit("hotReload", event);
    }
  }

  public getConfig(): HotReloadConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<HotReloadConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public async dispose(): Promise<void> {
    await this.stopWatching();
    this.removeAllListeners();
  }
}
