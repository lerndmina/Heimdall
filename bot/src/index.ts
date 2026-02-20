/**
 * Heimdall v1 - Main Entry Point
 * Plugin-based Discord bot with phased initialization
 */

import dotenv from "dotenv";
dotenv.config(); // Load environment variables from .env file FIRST

// Initialize Sentry FIRST (before any other imports that might throw errors)
import { initializeSentry, captureException, flush as flushSentry } from "./utils/sentry";

initializeSentry({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  enabled: process.env.SENTRY_ENABLED !== "false",
});

import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import mongoose from "mongoose";
import { createClient, type RedisClientType } from "redis";
import * as path from "path";
import * as readline from "readline";
import { fileURLToPath } from "url";
import { envLoader } from "./utils/env";
import log from "./utils/logger";
import type { HeimdallClient } from "./types/Client";
import { PluginLoader } from "./core/PluginLoader";
import { ComponentCallbackService } from "./core/services/ComponentCallbackService";
import { GuildEnvService } from "./core/services/GuildEnvService";
import { CommandManager } from "./core/CommandManager";
import { EventManager } from "./core/EventManager";
import { ApiManager } from "./core/ApiManager";
import { InteractionHandler } from "./core/InteractionHandler";
import { OwnerCommands } from "./core/OwnerCommands";
import { WebSocketManager } from "./core/WebSocketManager";
import { setWebSocketManager, clearWebSocketManager } from "./core/broadcast";
import { PermissionService } from "./core/PermissionService";
import { buildHelpCommandData, createHelpExecute } from "./core/HelpCommand";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Phase 1: Load and validate environment
// ============================================================================
log.info("🚀 Heimdall v1 Starting...");
log.debug("Phase 1: Loading environment variables...");

const env = envLoader.loadGlobalEnv();

// ============================================================================
// Phase 2: Database connections
// ============================================================================

/**
 * Connect to MongoDB
 */
async function connectMongoDB(uri: string, database: string): Promise<typeof mongoose> {
  log.debug("Connecting to MongoDB...");
  await mongoose.connect(uri, { dbName: database });
  log.debug("✅ MongoDB connected");
  return mongoose;
}

/**
 * Connect to Redis
 */
async function connectRedis(url: string): Promise<RedisClientType> {
  log.debug("Connecting to Redis...");
  const redis = createClient({ url }) as RedisClientType;

  redis.on("error", (err) => log.error("Redis error:", err));
  redis.on("reconnecting", () => log.warn("Redis reconnecting..."));

  await redis.connect();
  log.debug("✅ Redis connected");

  return redis;
}

// ============================================================================
// Phase 3: Discord client configuration
// ============================================================================

const CLIENT_OPTIONS = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction],
} as const;

let baseClient = new Client(CLIENT_OPTIONS);

// Export client for use by plugins and other modules
export let client: HeimdallClient;

// Store Redis reference for shutdown
let redis: RedisClientType;

// Store plugin loader reference for shutdown
let pluginLoader: PluginLoader | null = null;

// Store core services for access
let componentCallbackService: ComponentCallbackService;
let guildEnvService: GuildEnvService;
let commandManager: CommandManager;
let eventManager: EventManager;
let apiManager: ApiManager;
let interactionHandler: InteractionHandler;
let permissionService: PermissionService;
let wsManager: WebSocketManager | null = null;

// ============================================================================
// Phase 4: Ready event handler
// ============================================================================

async function onReady(readyClient: Client<true>): Promise<void> {
  log.info(`✅ Ready! Serving ${readyClient.guilds.cache.size} guilds as ${readyClient.user.tag}`);

  const heimdallClient = readyClient as unknown as HeimdallClient;

  // Set last restart time in Redis
  try {
    await redis.set(`${readyClient.user.id}-lastRestart`, Date.now().toString());
  } catch (error) {
    log.warn("Failed to set last restart time in Redis:", error);
  }

  // Load plugins now that the client is fully connected and caches are populated.
  // This ensures Discord entities (channels, guilds, users) are fetchable
  // during plugin initialization (e.g. BackgroundModmailService orphan checks).
  log.debug("Phase 4: Loading plugins...");
  const wsPort = parseInt(process.env.WS_PORT || "3002", 10);
  wsManager = new WebSocketManager(wsPort, heimdallClient, redis);
  heimdallClient.wsManager = wsManager;
  setWebSocketManager(wsManager);

  pluginLoader = new PluginLoader({
    pluginsDir: path.join(__dirname, "..", "plugins"),
    client: heimdallClient,
    redis,

    componentCallbackService,
    guildEnvService,
    commandManager,
    eventManager,
    apiManager,
    wsManager,
  });

  try {
    await pluginLoader.loadAll();
    log.info(`✅ Loaded ${pluginLoader.getAllPlugins().size} plugin(s)`);
  } catch (error) {
    log.error("Plugin loading failed:", error);
    captureException(error, { context: "Plugin Loading" });
  }

  // Create and attach interaction handler
  interactionHandler = new InteractionHandler({
    client: heimdallClient,
    commandManager,
    componentCallbackService,
    permissionService,
  });
  interactionHandler.attach();

  // Create and attach owner commands handler
  const ownerCommands = new OwnerCommands({
    client: heimdallClient,
    commandManager,
    prefix: env.PREFIX,
    ownerIds: env.OWNER_IDS,
    botToken: env.BOT_TOKEN,
  });
  ownerCommands.attach();

  // Attach events after plugins have registered them
  eventManager.attachEvents();

  // Set exported client reference
  client = heimdallClient;

  // Register core help command (after plugins so it can list all commands)
  commandManager.registerCommand({
    data: buildHelpCommandData(),
    config: { pluginName: "core" },
    execute: createHelpExecute(commandManager),
  });

  // Register commands now that plugins are loaded
  try {
    log.debug("Registering commands to all guilds...");
    await commandManager.registerAllCommandsToGuilds();

    log.info(`✅ Commands registered (${commandManager.getStats().total} total)`);
  } catch (error) {
    log.error("Failed to register commands:", error);
    captureException(error, { context: "Command Registration" });
  }

  // Give API manager access to the Discord client for guild status checks
  apiManager.setClient(readyClient);

  // Start API server
  try {
    await apiManager.start();
    if (wsManager) {
      await wsManager.start();
    }
  } catch (error) {
    log.error("Failed to start API server:", error);
    captureException(error, { context: "API Server Start" });
  }
}

baseClient.once(Events.ClientReady, onReady);

// Register commands when joining a new guild
baseClient.on(Events.GuildCreate, async (guild) => {
  log.info(`📥 Joined guild: ${guild.name} (${guild.id})`);
  try {
    await commandManager.registerCommandsToGuild(guild.id);
    log.info(`✅ Registered commands for new guild: ${guild.name} (${guild.id})`);
  } catch (error) {
    log.error(`Failed to register commands for new guild ${guild.name} (${guild.id}):`, error);
  }
});

// Global cleanup for persistent components when source messages/channels are deleted
baseClient.on(Events.MessageDelete, async (message) => {
  try {
    const deleted = await componentCallbackService.cleanupByMessageId(message.id);
    if (deleted > 0) {
      log.debug(`[ComponentCleanup] Removed ${deleted} persistent component(s) for deleted message ${message.id}`);
    }
  } catch (error) {
    log.error(`[ComponentCleanup] Failed message cleanup for ${message.id}:`, error);
  }
});

baseClient.on(Events.ChannelDelete, async (channel) => {
  try {
    const deleted = await componentCallbackService.cleanupByChannelId(channel.id);
    if (deleted > 0) {
      log.debug(`[ComponentCleanup] Removed ${deleted} persistent component(s) for deleted channel ${channel.id}`);
    }
  } catch (error) {
    log.error(`[ComponentCleanup] Failed channel cleanup for ${channel.id}:`, error);
  }
});

// Auto-attach persistent component message context on bot message send/edit
baseClient.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author?.id !== baseClient.user?.id) return;
    await componentCallbackService.attachContextFromMessage(message);
  } catch (error) {
    log.error(`[ComponentCleanup] Failed to auto-attach context for message ${message.id}:`, error);
  }
});

baseClient.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
  try {
    const authorId = (newMessage as { author?: { id?: string } }).author?.id;
    if (authorId !== baseClient.user?.id) return;
    await componentCallbackService.attachContextFromMessage(newMessage);
  } catch (error) {
    const messageId = (newMessage as { id?: string }).id ?? "unknown";
    log.error(`[ComponentCleanup] Failed to auto-attach context for updated message ${messageId}:`, error);
  }
});

// ============================================================================
// Phase 5: Error handling
// ============================================================================

baseClient.on(Events.Error, (error) => {
  log.error("Discord client error:", error);
  captureException(error, { context: "Discord Client Error" });
});

process.on("unhandledRejection", (error) => {
  log.error("Unhandled promise rejection:", error);
  captureException(error, { context: "Unhandled Promise Rejection" });
});

process.on("uncaughtException", (error) => {
  log.error("Uncaught exception:", error);
  captureException(error, { context: "Uncaught Exception" });
  // Allow Sentry to send the error before exiting
  setTimeout(() => process.exit(1), 1000);
});

// ============================================================================
// Phase 6: Graceful shutdown
// ============================================================================

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    log.warn(`Received ${signal} again, forcing exit...`);
    process.exit(1);
  }
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down gracefully...`);

  // Force exit after 10 seconds if graceful shutdown hangs
  const forceTimer = setTimeout(() => {
    log.error("Shutdown timed out after 10s, forcing exit...");
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  try {
    // Unload plugins first (in reverse order)
    if (pluginLoader) {
      await pluginLoader.unloadAll();
      log.debug("Plugins unloaded");
    }

    if (wsManager) {
      await wsManager.stop();
      wsManager = null;
      clearWebSocketManager();
      log.debug("WebSocket server stopped");
    }

    // Destroy Discord client
    baseClient.destroy();
    log.debug("Discord client destroyed");

    // Close Redis
    if (redis) {
      await redis.quit();
      log.debug("Redis disconnected");
    }

    // Close MongoDB
    await mongoose.disconnect();
    log.debug("MongoDB disconnected");

    // Flush Sentry events
    await flushSentry();

    log.info("✅ Shutdown complete");
    process.exit(0);
  } catch (error) {
    log.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ============================================================================
// Phase 6b: Stdin command interface
// ============================================================================

const rl = readline.createInterface({ input: process.stdin, terminal: false });

async function restart(): Promise<void> {
  log.info("♻️  Restarting bot...");

  try {
    // Unload all plugins (reverse order)
    if (pluginLoader) {
      await pluginLoader.unloadAll();
      pluginLoader = null;
      log.debug("Plugins unloaded");
    }

    // Stop API server
    if (apiManager?.isStarted()) {
      await apiManager.stop();
      log.debug("API server stopped");
    }

    // Remove all listeners from the client (events, interactions, etc.)
    baseClient.removeAllListeners();
    log.debug("All client listeners removed");

    // Destroy Discord client session
    baseClient.destroy();
    log.debug("Discord client destroyed");

    // Close database connections
    if (redis) {
      await redis.quit();
      log.debug("Redis disconnected");
    }
    await mongoose.disconnect();
    log.debug("MongoDB disconnected");

    // Create a fresh client instance — discord.js destroy() is terminal,
    // login() will hang on a destroyed client.
    baseClient = new Client(CLIENT_OPTIONS);
    log.debug("New Discord client created");

    // Re-attach the ready handler and error handler for the new client
    baseClient.once(Events.ClientReady, onReady);
    baseClient.on(Events.Error, (error) => {
      log.error("Discord client error:", error);
      captureException(error, { context: "Discord Client Error" });
    });

    log.info("🔄 All modules unloaded, restarting...");

    // Re-run the full startup sequence
    await start();
  } catch (error) {
    log.error("Error during restart:", error);
    captureException(error, { context: "Bot Restart" });
  }
}

rl.on("line", async (line: string) => {
  const input = line.trim().toLowerCase();
  if (!input) return;

  switch (input) {
    case "stop":
    case "quit":
    case "exit":
      await shutdown("stdin");
      break;

    case "restart":
    case "reload":
      await restart();
      break;

    case "status": {
      const guilds = baseClient.guilds?.cache?.size ?? 0;
      const plugins = pluginLoader?.getAllPlugins().size ?? 0;
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      log.info(`📊 Status — Guilds: ${guilds} | Plugins: ${plugins} | Uptime: ${h}h ${m}m ${s}s | Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`);
      break;
    }

    case "help":
      log.info("📖 Available commands: stop, restart, status, help");
      break;

    default:
      log.warn(`Unknown command: "${input}". Type "help" for available commands.`);
      break;
  }
});

// ============================================================================
// Phase 7: Startup sequence
// ============================================================================

async function start(): Promise<void> {
  try {
    // Connect to databases
    log.debug("Phase 2: Connecting to databases...");
    await connectMongoDB(env.MONGODB_URI, env.MONGODB_DATABASE);
    redis = await connectRedis(env.REDIS_URL);

    // Attach core infrastructure to client
    log.debug("Phase 3: Configuring client...");
    (baseClient as unknown as HeimdallClient).redis = redis;
    (baseClient as unknown as HeimdallClient).mongoConnection = mongoose.connection;
    (baseClient as unknown as HeimdallClient).plugins = new Map();

    // ========================================================================
    // Phase 3b: Initialize core services
    // ========================================================================
    log.debug("Phase 3b: Initializing core services...");

    // Permission service
    permissionService = new PermissionService(baseClient as HeimdallClient);

    // Component callback service
    componentCallbackService = new ComponentCallbackService(redis, env.NANOID_LENGTH ?? 12, permissionService);
    await componentCallbackService.loadPersistentComponents();

    // Guild environment service
    guildEnvService = new GuildEnvService(env.ENCRYPTION_KEY);

    // Command manager
    commandManager = new CommandManager(baseClient as HeimdallClient, env.BOT_TOKEN);

    // Event manager
    eventManager = new EventManager(baseClient as HeimdallClient);

    // API manager
    apiManager = new ApiManager(env.API_PORT ?? 3001, env.INTERNAL_API_KEY);

    log.debug("✅ Core services initialized");

    // Login to Discord — plugins are loaded in the ready event handler
    // so that all Discord caches and API access are available during init.
    log.debug("Phase 4: Logging in to Discord...");
    await baseClient.login(env.BOT_TOKEN);
  } catch (error) {
    log.error("Failed to start bot:", error);
    captureException(error, { context: "Bot Startup" });
    await flushSentry();
    process.exit(1);
  }
}

// Start the bot
start();
