/**
 * PluginLoader - Scans, resolves dependencies, and loads plugins
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
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
import type { WebSocketManager } from "./WebSocketManager";
import type { CommandPermissionDefinition, CommandPermissionKeys } from "./CommandManager";
import { permissionRegistry } from "./PermissionRegistry.js";
import { ApplicationCommandOptionType } from "discord.js";

export interface PluginLoaderOptions {
  pluginsDir: string;
  client: HeimdallClient;
  redis: RedisClientType;
  componentCallbackService: ComponentCallbackService;
  guildEnvService: GuildEnvService;
  commandManager: CommandManager;
  eventManager: EventManager;
  apiManager: ApiManager;
  wsManager: WebSocketManager;
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
  private readonly wsManager: WebSocketManager;

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
    this.wsManager = options.wsManager;
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

        log.debug(`✅ Loaded plugin: ${name}`);
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

    // Dynamic import (use file:// URL for Node.js ESM compatibility on Windows)
    const module: PluginModule = await import(pathToFileURL(entryPath).href);

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

    // Load context menu commands if path is specified
    if (module.contextMenuCommands) {
      await this.loadPluginContextMenuCommands(manifest.name, pluginPath, module.contextMenuCommands);
    }

    // Load events if path is specified
    if (module.events) {
      await this.loadPluginEvents(manifest.name, pluginPath, module.events);
    }

    // Auto-mount API routes if path is specified and manifest has apiRoutePrefix
    if (module.api) {
      await this.loadPluginApi(manifest.name, pluginPath, module.api, manifest.apiRoutePrefix, api);
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
      // Skip helper files prefixed with _ (e.g., _autocomplete.ts)
      const fileName = path.basename(file);
      if (fileName.startsWith("_")) continue;

      try {
        const commandModule = await import(pathToFileURL(file).href);

        // Must have at least data
        if (!commandModule.data) {
          log.warn(`Command file ${file} missing data export, skipping`);
          continue;
        }

        let execute = commandModule.execute;

        // If no execute, auto-discover subcommand router at subcommands/{commandName}/index.ts
        if (!execute) {
          const commandName = commandModule.data.name ?? commandModule.data.toJSON?.().name;
          if (commandName) {
            const subcommandPath = path.join(pluginPath, "subcommands", commandName, "index.ts");
            if (fs.existsSync(subcommandPath)) {
              const subModule = await import(pathToFileURL(subcommandPath).href);
              execute = subModule.execute;
              if (execute) {
                log.debug(`Auto-discovered subcommand router for /${commandName}`);
              }
            }
          }

          if (!execute) {
            log.warn(`Command file ${file} missing execute export and no subcommand router found, skipping`);
            continue;
          }
        }

        const config = commandModule.config ?? {};
        const commandName = commandModule.data.name ?? commandModule.data.toJSON?.().name;
        const permissionKeys = this.buildCommandPermissionKeys(pluginName, commandName, commandModule.data.toJSON ? commandModule.data.toJSON() : commandModule.data, commandModule.permissions);

        this.commandManager.registerCommand({
          data: commandModule.data.toJSON ? commandModule.data.toJSON() : commandModule.data,
          config: {
            pluginName,
            cooldown: config.cooldown,
          },
          execute,
          autocomplete: commandModule.autocomplete,
          permissionKeys,
        });

        log.debug(`Loaded command: ${commandModule.data.name} from plugin ${pluginName}`);
      } catch (error) {
        log.error(`Failed to load command from ${file}:`, error);
      }
    }
  }

  /**
   * Load context menu commands from a plugin's context menu commands directory
   */
  private async loadPluginContextMenuCommands(pluginName: string, pluginPath: string, contextMenuCommandsPath: string): Promise<void> {
    const fullPath = path.join(pluginPath, contextMenuCommandsPath);

    if (!fs.existsSync(fullPath)) {
      log.warn(`Plugin ${pluginName} contextMenuCommands path does not exist: ${contextMenuCommandsPath}`);
      return;
    }

    const files = this.scanDirectory(fullPath, [".ts", ".js"]);

    for (const file of files) {
      const fileName = path.basename(file);
      if (fileName.startsWith("_")) continue;

      try {
        const commandModule = await import(pathToFileURL(file).href);

        if (!commandModule.data) {
          log.warn(`Context menu command file ${file} missing data export, skipping`);
          continue;
        }

        if (!commandModule.execute) {
          log.warn(`Context menu command file ${file} missing execute export, skipping`);
          continue;
        }

        const config = commandModule.config ?? {};
        const commandName = commandModule.data.name ?? commandModule.data.toJSON?.().name;
        const permissionKey = this.buildContextMenuPermissionKey(pluginName, commandName, commandModule.permissions);

        this.commandManager.registerContextMenuCommand({
          data: commandModule.data.toJSON ? commandModule.data.toJSON() : commandModule.data,
          config: {
            pluginName,
            cooldown: config.cooldown,
          },
          execute: commandModule.execute,
          permissionKey,
        });

        log.debug(`Loaded context menu command: ${commandModule.data.name} from plugin ${pluginName}`);
      } catch (error) {
        log.error(`Failed to load context menu command from ${file}:`, error);
      }
    }
  }

  private buildCommandPermissionKeys(pluginName: string, commandName: string | undefined, commandData: any, permissions?: CommandPermissionDefinition): CommandPermissionKeys | undefined {
    if (!commandName) return undefined;

    const subcommands = this.getSubcommandPaths(commandData);
    const keys: CommandPermissionKeys = { base: undefined, subcommands: {} };

    if (subcommands.length > 0) {
      for (const sub of subcommands) {
        const actionKey = `commands.${commandName}.${sub.path}`;
        const fullKey = `${pluginName}.${actionKey}`;
        keys.subcommands[sub.path] = fullKey;

        const override = permissions?.subcommands?.[sub.path];
        const label = override?.label ?? `/${commandName} ${sub.path.replace(/\./g, " ")}`;
        const description = override?.description ?? sub.description ?? permissions?.description ?? "";
        const defaultAllow = override?.defaultAllow ?? permissions?.defaultAllow;

        permissionRegistry.registerAction(pluginName, {
          key: actionKey,
          label,
          description,
          defaultAllow,
        });
      }

      return keys;
    }

    const actionKey = `commands.${commandName}`;
    keys.base = `${pluginName}.${actionKey}`;

    permissionRegistry.registerAction(pluginName, {
      key: actionKey,
      label: permissions?.label ?? `/${commandName}`,
      description: permissions?.description ?? commandData?.description ?? "",
      defaultAllow: permissions?.defaultAllow,
    });

    return keys;
  }

  private buildContextMenuPermissionKey(pluginName: string, commandName: string | undefined, permissions?: CommandPermissionDefinition): string | undefined {
    if (!commandName) return undefined;

    const actionKey = `commands.${commandName}`;
    const fullKey = `${pluginName}.${actionKey}`;

    permissionRegistry.registerAction(pluginName, {
      key: actionKey,
      label: permissions?.label ?? commandName,
      description: permissions?.description ?? "",
      defaultAllow: permissions?.defaultAllow,
    });

    return fullKey;
  }

  private getSubcommandPaths(commandData: any): Array<{ path: string; description?: string }> {
    const options: any[] = commandData?.options ?? [];
    const results: Array<{ path: string; description?: string }> = [];

    const walk = (opts: any[], prefix?: string): void => {
      for (const opt of opts) {
        if (opt.type === ApplicationCommandOptionType.Subcommand) {
          const path = prefix ? `${prefix}.${opt.name}` : opt.name;
          results.push({ path, description: opt.description });
        } else if (opt.type === ApplicationCommandOptionType.SubcommandGroup && Array.isArray(opt.options)) {
          const nextPrefix = prefix ? `${prefix}.${opt.name}` : opt.name;
          walk(opt.options, nextPrefix);
        }
      }
    };

    walk(options);
    return results;
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
        const eventModule = await import(pathToFileURL(file).href);

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

        log.debug(`Loaded event: ${String(eventModule.event)} from plugin ${pluginName}`);
      } catch (error) {
        log.error(`Failed to load event from ${file}:`, error);
      }
    }
  }

  /**
   * Auto-mount API routes from a plugin's api directory.
   *
   * Expects the api/index.ts to export:
   *   export function createRouter(api: PluginAPI): Router
   *
   * The plugin's API object (returned from onLoad) is passed as the deps argument.
   * Swagger paths are derived automatically from all .ts files in the api directory.
   */
  private async loadPluginApi(pluginName: string, pluginPath: string, apiPath: string, routePrefix: string | undefined, pluginApi: PluginAPI): Promise<void> {
    const fullPath = path.join(pluginPath, apiPath);

    if (!fs.existsSync(fullPath)) {
      log.warn(`Plugin ${pluginName} api path does not exist: ${apiPath}`);
      return;
    }

    if (!routePrefix) {
      log.warn(`Plugin ${pluginName} exports api but has no apiRoutePrefix in manifest, skipping API mount`);
      return;
    }

    const indexPath = path.join(fullPath, "index.ts");
    if (!fs.existsSync(indexPath)) {
      // Try .js fallback
      const jsPath = path.join(fullPath, "index.js");
      if (!fs.existsSync(jsPath)) {
        log.warn(`Plugin ${pluginName} api directory has no index.ts or index.js, skipping API mount`);
        return;
      }
    }

    try {
      const apiModule = await import(pathToFileURL(indexPath).href);

      if (typeof apiModule.createRouter !== "function") {
        log.warn(`Plugin ${pluginName} api/index.ts does not export createRouter(), skipping API mount`);
        return;
      }

      const router = apiModule.createRouter(pluginApi);

      // Derive swagger paths from all .ts files in the api directory
      const swaggerPaths = this.scanDirectory(fullPath, [".ts", ".js"]).map((f) => f.replace(/\\/g, "/"));

      this.apiManager.registerRouter({
        pluginName,
        prefix: routePrefix,
        router,
        swaggerPaths,
      });

      log.info(`Mounted API routes: ${routePrefix} (${pluginName})`);
    } catch (error) {
      log.error(`Failed to load API routes for ${pluginName}:`, error);
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
      wsManager: this.wsManager,
      permissionRegistry,
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
