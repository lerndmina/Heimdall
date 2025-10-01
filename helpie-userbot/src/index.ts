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
import fetchEnvs from "./utils/FetchEnvs";
import log from "./utils/log";

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

  // Initialize our simple command handler
  const commandsPath = path.join(__dirname, "commands", "user");
  const commandHandler = new SimpleCommandHandler(client, commandsPath);

  log.info("Loading commands...");
  await commandHandler.loadCommands();
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

  // Register commands after login
  log.info("Registering /helpie command with Discord...");
  await commandHandler.registerCommands(env.BOT_TOKEN, client.user!.id);

  // Setup interaction handler
  commandHandler.setupInteractionHandler();

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
