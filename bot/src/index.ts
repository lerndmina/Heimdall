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
  log.info("✅ MongoDB connected");
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
  log.info("✅ Redis connected");

  return redis;
}

// ============================================================================
// Phase 3: Discord client configuration
// ============================================================================

const baseClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember],
});

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

// ============================================================================
// Phase 4: Ready event handler
// ============================================================================

baseClient.once(Events.ClientReady, async (readyClient) => {
  log.info(`✅ Ready! Serving ${readyClient.guilds.cache.size} guilds as ${readyClient.user.tag}`);

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
  pluginLoader = new PluginLoader({
    pluginsDir: path.join(__dirname, "..", "plugins"),
    client: readyClient as unknown as HeimdallClient,
    redis,

    componentCallbackService,
    guildEnvService,
    commandManager,
    eventManager,
    apiManager,
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
    client: readyClient as unknown as HeimdallClient,
    commandManager,
    componentCallbackService,
  });
  interactionHandler.attach();

  // Create and attach owner commands handler
  const ownerCommands = new OwnerCommands({
    client: readyClient as unknown as HeimdallClient,
    commandManager,
    prefix: env.PREFIX,
    ownerIds: env.OWNER_IDS,
    botToken: env.BOT_TOKEN,
  });
  ownerCommands.attach();

  // Attach events after plugins have registered them
  eventManager.attachEvents();

  // Set exported client reference
  client = readyClient as unknown as HeimdallClient;

  // Register commands now that plugins are loaded
  try {
    log.debug("Registering commands to all guilds...");
    await commandManager.registerAllCommandsToGuilds();

    log.info(`✅ Commands registered (${commandManager.getStats().total} total)`);
  } catch (error) {
    log.error("Failed to register commands:", error);
    captureException(error, { context: "Command Registration" });
  }

  // Start API server
  try {
    await apiManager.start();
  } catch (error) {
    log.error("Failed to start API server:", error);
    captureException(error, { context: "API Server Start" });
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

async function shutdown(signal: string): Promise<void> {
  log.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Unload plugins first (in reverse order)
    if (pluginLoader) {
      await pluginLoader.unloadAll();
      log.debug("Plugins unloaded");
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

    // Component callback service
    componentCallbackService = new ComponentCallbackService(redis, env.NANOID_LENGTH ?? 12);
    await componentCallbackService.loadPersistentComponents();

    // Guild environment service
    guildEnvService = new GuildEnvService(env.ENCRYPTION_KEY);

    // Command manager
    commandManager = new CommandManager(baseClient as HeimdallClient, env.BOT_TOKEN);

    // Event manager
    eventManager = new EventManager(baseClient as HeimdallClient);

    // API manager
    apiManager = new ApiManager(env.API_PORT ?? 3001);

    log.info("✅ Core services initialized");

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
