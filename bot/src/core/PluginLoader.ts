/**
 * PluginLoader - Scans, resolves dependencies, and loads plugins
 */

import * as fs from "fs";
import * as path from "path";
import log from "../utils/logger";
import type { PluginManifest, PluginContext, PluginModule, PluginAPI, LoadedPlugin, PluginsConfig, PluginLogger } from "../types/Plugin";
import type { HeimdallClient } from "../types/Client";
import mongoose from "mongoose";
import type { RedisClientType } from "redis";
import type { ComponentCallbackService } from "./services/ComponentCallbackService";
import type { GuildEnvService } from "./services/GuildEnvService";
import type { CommandManager } from "./CommandManager";
import type { EventManager } from "./EventManager";
import type { ApiManager } from "./ApiManager";

export interface PluginLoaderOptions {
  pluginsDir: string;
  client: HeimdallClient;
  redis: RedisClientType;
  componentCallbackService: ComponentCallbackService;
  guildEnvService: GuildEnvService;
  commandManager: CommandManager;
  eventManager: EventManager;
  apiManager: ApiManager;
}

export class PluginLoader {
  private readonly pluginsDir: string;
  private readonly client: HeimdallClient;
  private readonly redis: RedisClientType;

  // Core services
  private readonly componentCallbackService: ComponentCallbackService;
  private readonly guildEnvService: GuildEnvService;
  private readonly commandManager: CommandManager;
  private readonly eventManager: EventManager;
  private readonly apiManager: ApiManager;

  private manifests: Map<string, PluginManifest> = new Map();
  private pluginPaths: Map<string, string> = new Map();
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private loadOrder: string[] = [];

  constructor(options: PluginLoaderOptions) {
    this.pluginsDir = options.pluginsDir;
    this.client = options.client;
    this.redis = options.redis;
    this.componentCallbackService = options.componentCallbackService;
    this.guildEnvService = options.guildEnvService;
    this.commandManager = options.commandManager;
    this.eventManager = options.eventManager;
    this.apiManager = options.apiManager;
  }

  /**
   * Main entry point - scan, resolve, and load all plugins
   */
  async loadAll(): Promise<Map<string, LoadedPlugin>> {
    // Step 1: Scan for plugins
    await this.scanPlugins();

    // Step 2: Apply config overrides
    await this.applyConfigOverrides();

    // Step 3: Validate dependencies and env
    this.validatePlugins();

    // Step 4: Resolve load order
    this.resolveLoadOrder();

    // Step 5: Load plugins in order
    await this.loadPluginsInOrder();

    return this.loadedPlugins;
  }

  /**
   * Scan plugins directory for manifest.json files
   */
  private async scanPlugins(): Promise<void> {
    log.debug(`Scanning plugins directory: ${this.pluginsDir}`);

    if (!fs.existsSync(this.pluginsDir)) {
      log.warn(`Plugins directory does not exist: ${this.pluginsDir}`);
      return;
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue; // Skip hidden dirs

      const pluginPath = path.join(this.pluginsDir, entry.name);
      const manifestPath = path.join(pluginPath, "manifest.json");

      if (!fs.existsSync(manifestPath)) {
        log.warn(`Plugin ${entry.name} has no manifest.json, skipping`);
        continue;
      }

      try {
        const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
        const manifest: PluginManifest = JSON.parse(manifestRaw);

        // Apply defaults
        manifest.main = manifest.main ?? "index.ts";
        manifest.dependencies = manifest.dependencies ?? [];
        manifest.optionalDependencies = manifest.optionalDependencies ?? [];
        manifest.requiredEnv = manifest.requiredEnv ?? [];
        manifest.optionalEnv = manifest.optionalEnv ?? [];
        manifest.disabled = manifest.disabled ?? false;

        // Skip disabled plugins
        if (manifest.disabled) {
          log.debug(`Plugin ${manifest.name} is disabled, skipping`);
          continue;
        }

        this.manifests.set(manifest.name, manifest);
        this.pluginPaths.set(manifest.name, pluginPath);
        log.debug(`Found plugin: ${manifest.name} v${manifest.version}`);
      } catch (error) {
        log.error(`Failed to parse manifest for ${entry.name}:`, error);
      }
    }

    log.info(`Found ${this.manifests.size} plugin(s)`);
  }

  /**
   * Apply plugins.json config overrides if present
   */
  private async applyConfigOverrides(): Promise<void> {
    const configPath = path.join(path.dirname(this.pluginsDir), "plugins.json");

    if (!fs.existsSync(configPath)) {
      return; // No override config
    }

    try {
      const configRaw = fs.readFileSync(configPath, "utf-8");
      const config: PluginsConfig = JSON.parse(configRaw);

      // Apply disabled list
      if (config.disabled) {
        for (const name of config.disabled) {
          if (this.manifests.has(name)) {
            log.debug(`Plugin ${name} disabled via plugins.json`);
            this.manifests.delete(name);
            this.pluginPaths.delete(name);
          }
        }
      }

      // If explicit plugins list, filter to only those
      if (config.plugins) {
        const allowed = new Set(config.plugins);
        for (const name of this.manifests.keys()) {
          if (!allowed.has(name)) {
            log.debug(`Plugin ${name} not in plugins.json whitelist, skipping`);
            this.manifests.delete(name);
            this.pluginPaths.delete(name);
          }
        }
      }

      log.debug(`Applied config overrides, ${this.manifests.size} plugin(s) remaining`);
    } catch (error) {
      log.error("Failed to parse plugins.json:", error);
    }
  }

  /**
   * Validate all plugins have required dependencies and env vars
   */
  private validatePlugins(): void {
    const errors: string[] = [];

    for (const [name, manifest] of this.manifests) {
      // Check required dependencies exist
      for (const dep of manifest.dependencies) {
        if (!this.manifests.has(dep)) {
          errors.push(`Plugin "${name}" requires "${dep}" which is not available`);
        }
      }

      // Check required env vars exist
      for (const envKey of manifest.requiredEnv) {
        if (!process.env[envKey]) {
          errors.push(`Plugin "${name}" requires env var "${envKey}" which is not set`);
        }
      }
    }

    if (errors.length > 0) {
      for (const error of errors) {
        log.error(error);
      }
      throw new Error(`Plugin validation failed with ${errors.length} error(s)`);
    }

    log.debug("All plugins validated successfully");
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private resolveLoadOrder(): void {
    // Build adjacency list and in-degree count
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    // Initialize
    for (const name of this.manifests.keys()) {
      inDegree.set(name, 0);
      dependents.set(name, []);
    }

    // Build graph
    for (const [name, manifest] of this.manifests) {
      // Required dependencies
      for (const dep of manifest.dependencies) {
        dependents.get(dep)?.push(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }

      // Optional dependencies (only count if present)
      for (const dep of manifest.optionalDependencies) {
        if (this.manifests.has(dep)) {
          dependents.get(dep)?.push(name);
          inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    // Start with plugins that have no dependencies
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const dependent of dependents.get(current) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (result.length !== this.manifests.size) {
      const remaining = [...this.manifests.keys()].filter((n) => !result.includes(n));
      throw new Error(`Circular dependency detected involving: ${remaining.join(", ")}`);
    }

    this.loadOrder = result;
    if (result.length > 0) {
      log.info(`Plugin load order: ${result.join(" → ")}`);
    }
  }

  /**
   * Load plugins sequentially in resolved order
   */
  private async loadPluginsInOrder(): Promise<void> {
    for (const name of this.loadOrder) {
      try {
        const loaded = await this.loadPlugin(name);
        this.loadedPlugins.set(name, loaded);

        // Also store in client.plugins for easy access
        this.client.plugins.set(name, loaded.api);

        log.info(`✅ Loaded plugin: ${name}`);
      } catch (error) {
        log.error(`❌ Failed to load plugin ${name}:`, error);

        // Store failed state
        const manifest = this.manifests.get(name)!;
        this.loadedPlugins.set(name, {
          manifest,
          path: this.pluginPaths.get(name)!,
          module: {} as PluginModule,
          api: {},
          logger: this.createPluginLogger(name),
          status: "failed",
          error: error instanceof Error ? error : new Error(String(error)),
        });

        // Fail fast - don't continue if a plugin fails
        throw error;
      }
    }
  }

  /**
   * Load a single plugin
   */
  private async loadPlugin(name: string): Promise<LoadedPlugin> {
    const manifest = this.manifests.get(name)!;
    const pluginPath = this.pluginPaths.get(name)!;
    const entryPath = path.join(pluginPath, manifest.main ?? "index.ts");

    log.debug(`Loading plugin ${name} from ${entryPath}`);

    // Dynamic import
    const module: PluginModule = await import(entryPath);

    if (typeof module.onLoad !== "function") {
      throw new Error(`Plugin ${name} does not export an onLoad function`);
    }

    // Gather dependency APIs
    const dependencies = new Map<string, PluginAPI>();
    for (const dep of manifest.dependencies) {
      const depPlugin = this.loadedPlugins.get(dep);
      if (depPlugin) {
        dependencies.set(dep, depPlugin.api);
      }
    }
    for (const dep of manifest.optionalDependencies) {
      const depPlugin = this.loadedPlugins.get(dep);
      if (depPlugin) {
        dependencies.set(dep, depPlugin.api);
      }
    }

    // Create context
    const context = this.createPluginContext(manifest, pluginPath, dependencies);

    // Call onLoad
    const api = await module.onLoad(context);

    // Load commands if path is specified
    if (module.commands) {
      await this.loadPluginCommands(manifest.name, pluginPath, module.commands);
    }

    // Load events if path is specified
    if (module.events) {
      await this.loadPluginEvents(manifest.name, pluginPath, module.events);
    }

    return {
      manifest,
      path: pluginPath,
      module,
      api,
      logger: context.logger,
      status: "loaded",
    };
  }

  /**
   * Load commands from a plugin's commands directory
   */
  private async loadPluginCommands(pluginName: string, pluginPath: string, commandsPath: string): Promise<void> {
    const fullPath = path.join(pluginPath, commandsPath);

    if (!fs.existsSync(fullPath)) {
      log.warn(`Plugin ${pluginName} commands path does not exist: ${commandsPath}`);
      return;
    }

    const files = this.scanDirectory(fullPath, [".ts", ".js"]);

    for (const file of files) {
      try {
        const commandModule = await import(file);

        // Validate required exports
        if (!commandModule.data || !commandModule.execute) {
          log.warn(`Command file ${file} missing data or execute export, skipping`);
          continue;
        }

        const config = commandModule.config ?? {};

        this.commandManager.registerCommand({
          data: commandModule.data.toJSON ? commandModule.data.toJSON() : commandModule.data,
          config: {
            pluginName,
            cooldown: config.cooldown,
          },
          execute: commandModule.execute,
          autocomplete: commandModule.autocomplete,
        });

        log.info(`Loaded command: ${commandModule.data.name} from plugin ${pluginName}`);
      } catch (error) {
        log.error(`Failed to load command from ${file}:`, error);
      }
    }
  }

  /**
   * Load events from a plugin's events directory
   */
  private async loadPluginEvents(pluginName: string, pluginPath: string, eventsPath: string): Promise<void> {
    const fullPath = path.join(pluginPath, eventsPath);

    if (!fs.existsSync(fullPath)) {
      log.warn(`Plugin ${pluginName} events path does not exist: ${eventsPath}`);
      return;
    }

    const files = this.scanDirectory(fullPath, [".ts", ".js"]);

    for (const file of files) {
      try {
        const eventModule = await import(file);

        // Validate required exports
        if (!eventModule.event || !eventModule.execute) {
          log.warn(`Event file ${file} missing event or execute export, skipping`);
          continue;
        }

        this.eventManager.registerEvent({
          event: eventModule.event,
          once: eventModule.once ?? false,
          pluginName,
          execute: eventModule.execute,
        });

        log.info(`Loaded event: ${String(eventModule.event)} from plugin ${pluginName}`);
      } catch (error) {
        log.error(`Failed to load event from ${file}:`, error);
      }
    }
  }

  /**
   * Recursively scan directory for files with given extensions
   */
  private scanDirectory(dir: string, extensions: string[]): string[] {
    const results: string[] = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...this.scanDirectory(fullPath, extensions));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /**
   * Create context for a plugin
   */
  private createPluginContext(manifest: PluginManifest, pluginPath: string, dependencies: Map<string, PluginAPI>): PluginContext {
    return {
      client: this.client,
      mongoose,
      redis: this.redis,
      manifest,
      pluginPath,
      logger: this.createPluginLogger(manifest.name),
      dependencies,
      getEnv: (key: string) => process.env[key],
      hasEnv: (key: string) => {
        const value = process.env[key];
        return value !== undefined && value !== "";
      },
      // Core services
      componentCallbackService: this.componentCallbackService,
      guildEnvService: this.guildEnvService,
      commandManager: this.commandManager,
      eventManager: this.eventManager,
      apiManager: this.apiManager,
    };
  }

  /**
   * Create a scoped logger for a plugin
   */
  private createPluginLogger(pluginName: string): PluginLogger {
    const prefix = `[${pluginName}]`;
    return {
      info: (...args) => log.info(prefix, ...args),
      warn: (...args) => log.warn(prefix, ...args),
      error: (...args) => log.error(prefix, ...args),
      debug: (...args) => log.debug(prefix, ...args),
    };
  }

  /**
   * Get loaded plugin by name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): Map<string, LoadedPlugin> {
    return this.loadedPlugins;
  }

  /**
   * Get load order
   */
  getLoadOrder(): string[] {
    return [...this.loadOrder];
  }

  /**
   * Unload all plugins (call onDisable)
   */
  async unloadAll(): Promise<void> {
    // Unload in reverse order
    for (const name of [...this.loadOrder].reverse()) {
      const plugin = this.loadedPlugins.get(name);
      if (plugin?.module.onDisable) {
        try {
          await plugin.module.onDisable(plugin.logger);
          log.debug(`Plugin ${name} unloaded`);
        } catch (error) {
          log.error(`Failed to unload plugin ${name}:`, error);
        }
      }
    }
  }
}
