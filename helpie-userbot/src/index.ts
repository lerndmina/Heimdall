/**
 * Helpie Userbot - A user-installable Discord bot for support tickets
 * This bot is installed on users, not guilds
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig(); // Load environment variables first

import { Client, GatewayIntentBits, Partials } from "discord.js";
import { SimpleCommandHandler } from "./utils/SimpleCommandHandler";
import path from "path";
import mongoose from "mongoose";
import { createClient } from "redis";
import fetchEnvs from "./utils/FetchEnvs";
import log from "./utils/log";

const env = fetchEnvs();

// Initialize Redis client
export const redisClient = createClient({
  url: env.REDIS_URI,
})
  .on("error", (err: Error) => {
    log.error("Redis Client Error", err);
    log.warn("Redis connection failed, but continuing...");
  })
  .on("ready", () => log.info("Redis Client Ready"));

// Track bot start time for uptime command (seconds since epoch)
export let botStartTime: number = Math.floor(Date.now() / 1000);

export const start = async () => {
  const startTime = Date.now();
  botStartTime = Math.floor(Date.now() / 1000); // Update when bot actually starts
  log.info("Starting Helpie Userbot...");

  // Create Discord client with minimal intents (user-installable bot)
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds, // For guild context if needed
      GatewayIntentBits.DirectMessages, // For DMs
      GatewayIntentBits.MessageContent, // To read message content
    ],
    partials: [Partials.Message, Partials.Channel, Partials.User],
  }) as Client<true>;

  // Set max listeners for events
  client.setMaxListeners(15);

  // Initialize our simple command handler
  const commandsPath = path.join(__dirname, "commands", "user");
  const eventsPath = path.join(__dirname, "events");
  const commandHandler = new SimpleCommandHandler(client, commandsPath, eventsPath);

  log.info("Loading commands...");
  await commandHandler.loadCommands();
  
  log.info("Loading events...");
  await commandHandler.loadEvents();
  
  // Setup event listeners and interaction handler BEFORE login
  // so ready event can be caught
  commandHandler.setupInteractionHandler();
  
  log.info("Command handler initialized");

  // Connect to MongoDB
  log.info("Connecting to MongoDB...");
  await mongoose
    .connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DATABASE,
      retryWrites: true,
    })
    .then(() => {
      log.info("Connected to MongoDB", { database: env.MONGODB_DATABASE });
    })
    .catch((error) => {
      log.error("Failed to connect to MongoDB:", error);
      process.exit(1);
    });

  // Connect to Redis
  log.info("Connecting to Redis...");
  try {
    await redisClient.connect();
    log.info("Redis connected successfully");
  } catch (error) {
    log.error("Failed to connect to Redis:", error);
    log.warn("Bot will continue without Redis caching");
  }

  // Login to Discord (ready event will fire after this)
  log.info("Logging in to Discord...");
  await client.login(env.BOT_TOKEN).catch((error) => {
    log.error("Failed to login to Discord:", error);
    process.exit(1);
  });

  // Register commands after login
  log.info("Registering /helpie command with Discord...");
  await commandHandler.registerCommands(env.BOT_TOKEN, client.user!.id);

  // Handle process termination
  process.on("SIGINT", async () => {
    log.info("Received SIGINT, shutting down gracefully...");
    if (redisClient.isReady) {
      await redisClient.quit();
      log.info("Redis client closed");
    }
    await mongoose.connection.close();
    await client.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log.info("Received SIGTERM, shutting down gracefully...");
    if (redisClient.isReady) {
      await redisClient.quit();
      log.info("Redis client closed");
    }
    await mongoose.connection.close();
    await client.destroy();
    process.exit(0);
  });
};

// Start the bot
start().catch((error) => {
  log.error("Fatal error during startup:", error);
  process.exit(1);
});
