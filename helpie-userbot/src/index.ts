/**
 * Helpie Userbot - A user-installable Discord bot for support tickets
 * This bot is installed on users, not guilds
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig(); // Load environment variables first

import { Client, GatewayIntentBits, Partials } from "discord.js";
import { CommandHandler } from "@heimdall/command-handler";
import path from "path";
import mongoose from "mongoose";
import fetchEnvs from "./utils/FetchEnvs";
import log from "./utils/log";

// Configure logger with environment variables
log.configure({
  minLevel: process.env.DEBUG_LOG === "true" ? 2 : 1, // DEBUG : INFO
  enableFileLogging: process.env.LOG_TO_FILE === "true",
});

const env = fetchEnvs();

export const start = async () => {
  const startTime = Date.now();
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

  // Define paths
  const commandsPath = path.join(__dirname, "commands");
  const eventsPath = path.join(__dirname, "events");
  const validationsPath = path.join(__dirname, "validations");

  log.info("Initializing command handler...", {
    commandsPath,
    eventsPath,
    validationsPath,
  });

  // Initialize custom CommandHandler
  await CommandHandler.create({
    client,
    commandsPath,
    eventsPath,
    validationsPath,
    devUserIds: env.OWNER_IDS, // Users who can access dev commands
    options: {
      enableManagementCommands: true,
      enableCommandManager: true,
      enableHotReload: process.env.NODE_ENV !== "production",
      enableAnalytics: false,
    },
    management: {
      enabled: true,
      ownerIds: env.OWNER_IDS,
      allowDMs: true, // Allow management commands in DMs
      allowGuild: true,
      enableHotReload: process.env.NODE_ENV !== "production",
      enableAnalytics: false,
    },
    hotReload: {
      enabled: process.env.NODE_ENV !== "production",
      watchMode: "development",
      watchDelay: 500,
      enableEventEmission: true,
      enableRollback: true,
    },
  });

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

  // Login to Discord
  log.info("Logging in to Discord...");
  await client.login(env.BOT_TOKEN).catch((error) => {
    log.error("Failed to login to Discord:", error);
    process.exit(1);
  });

  // Ready event
  client.once("ready", () => {
    const elapsedTime = Date.now() - startTime;
    log.info(`✅ Helpie Userbot is ready!`, {
      user: client.user.tag,
      id: client.user.id,
      startupTime: `${elapsedTime}ms`,
    });
  });

  // Handle process termination
  process.on("SIGINT", async () => {
    log.info("Received SIGINT, shutting down gracefully...");
    await mongoose.connection.close();
    await client.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log.info("Received SIGTERM, shutting down gracefully...");
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
