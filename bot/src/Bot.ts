// Load environment variables first before any imports
import { config as dotenvConfig } from "dotenv";
dotenvConfig(); // This ensures environment variables are loaded at the very beginning

// Fix CommandKit before importing it
import { fixCommandKit } from "../FixCommandKit";
fixCommandKit();

import {
  BaseInteraction,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  Snowflake,
} from "discord.js";
import { CommandKit } from "commandkit";
import path from "path";
import mongoose, { Collection } from "mongoose";
import { createClient } from "redis";
import fetchEnvs, { envExists } from "./utils/FetchEnvs";
import { debugMsg } from "./utils/TinyUtils";
import log from "./utils/log";
import aiModeration from "./services/aiModeration";
import mariadb from "mariadb";
// Configure logger to use environment variables
dotenvConfig();
log.info("Configuring logger with environment variables");
log.configure({
  minLevel: process.env.DEBUG_LOG === "true" ? log.LogLevel.DEBUG : log.LogLevel.INFO,
  enableFileLogging: process.env.LOG_TO_FILE === "true",
});
const env = fetchEnvs();

export const Start = async () => {
  startTimer();

  const client = new Client({
    intents: [Object.keys(GatewayIntentBits).map((key) => GatewayIntentBits[key])],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  }) as Client<true>;

  const commandsPath = path.join(__dirname, "commands");
  const eventsPath = path.join(__dirname, "events");
  const validationsPath = path.join(__dirname, "validations");
  const devGuildIds = env.TEST_SERVERS;
  const devUserIds = env.OWNER_IDS;

  log.info(`Loading commandkit with`, {
    commandsPath,
    eventsPath,
    validationsPath,
    devGuildIds,
    devUserIds,
  });

  // Using CommandKit (https://commandkit.underctrl.io)
  const commandKit = new CommandKit({
    client, // Discord.js client object | Required by default
    commandsPath, // The commands directory
    eventsPath, // The events directory
    validationsPath, // Only works if commandsPath is provided
    devGuildIds,
    devUserIds,
  });

  log.info(`Logging in to Discord with ${Object.keys(env).length} enviroment variables.`);

  await mongoose
    .connect(env.MONGODB_URI, { dbName: env.MONGODB_DATABASE, retryWrites: true })
    .then(async () => {
      log.info("Connected to MongoDB");

      // Initialize database indexes for modmail message tracking
      try {
        const { default: ModmailMessageService } = await import("./services/ModmailMessageService");
        await ModmailMessageService.initialize();
      } catch (error) {
        log.error("Failed to initialize ModmailMessageService:", error);
      }

      await redisClient.connect();
      await createFivemPool();
      updateAprilFoolsStatus();
      scheduleNextMidnight();

      // Start API server
      try {
        const { ApiServer } = await import("./api/server");
        const apiServer = new ApiServer(client, commandKit);
        await apiServer.start();
        log.info(`API server started on port ${env.API_PORT}`);
      } catch (error) {
        log.error("Failed to start API server:", error);
      }

      await client.login(env.BOT_TOKEN);
    });

  // Handle AI moderation events
  client.on(Events.MessageCreate, async (message) => {
    aiModeration(message, client);
  });

  return { client, commandKit, redisClient, mongoose };
};

/**
 * @description Random funny bot messages for a footer.
 */
const JOKE_MESSAGES: string[] = [
  "Help! I'm not a bot. The staff are holding me hostage forcing me to manually respond to every message.",
  "It's so dark in here. I can't see anything. Send help.",
  "I'm not a bot. I'm a human being. I swear.",
  "Please tell the staff to let me out of this room. I'm not a bot.",
  "I've not seen the sun in years! Please send help.",
];

const NORMAL_MESSAGES: string[] = [
  "To contact the staff team, DM this bot and I'll open a ticket for you.",
];

export let isAprilFools = false;

function updateAprilFoolsStatus() {
  const date = new Date();
  isAprilFools = date.getMonth() === 3 && date.getDate() === 1;
}

function scheduleNextMidnight() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const timeUntilMidnight = tomorrow.getTime() - now.getTime();

  log.debug(`Scheduling April Fools check in ${timeUntilMidnight / 1000} seconds`);

  setTimeout(() => {
    updateAprilFoolsStatus();
    log.debug("Running midnight April Fools check");
    setInterval(() => {
      updateAprilFoolsStatus();
      log.debug("Running daily April Fools check");
    }, 24 * 60 * 60 * 1000);
  }, timeUntilMidnight);
}

export function getRandomFooterMessage() {
  return isAprilFools
    ? JOKE_MESSAGES[Math.floor(Math.random() * JOKE_MESSAGES.length)]
    : NORMAL_MESSAGES[Math.floor(Math.random() * NORMAL_MESSAGES.length)];
}

export const ROLE_BUTTON_PREFIX = "roleGive-";

export const waitingEmoji: string = env.WAITING_EMOJI;

export const COOLDOWN_PREFIX = "cooldown";

export function userCooldownKey(userId: Snowflake, commandName: string) {
  return `${COOLDOWN_PREFIX}:${userId}:${commandName}`;
}

export function guildCooldownKey(guildId: Snowflake, commandName: string) {
  return `${COOLDOWN_PREFIX}:${guildId}:${commandName}`;
}

export function globalCooldownKey(commandName: string) {
  return `${COOLDOWN_PREFIX}:${commandName}`;
}

/**
 * @description Set a cooldown for a command
 * @param {string} key The key to set the cooldown for
 * @param {number} cooldownSeconds The cooldown in seconds
 * @returns {Promise<void>}
 */
export const setCommandCooldown = async function (key: string, cooldownSeconds: number) {
  const time = Date.now() + cooldownSeconds * 1000;
  const setting = await redisClient.set(key, time);
  log.debug(
    setting
      ? `Set cooldown for ${key} for ${cooldownSeconds}s`
      : `Failed to set cooldown for ${key}`
  );
  if (setting) await redisClient.expire(key, cooldownSeconds);
};

export function removeMentions(str: string) {
  return str.replace(/<@.*?>|@here|@everyone/g, "");
}

var startTime: Date;

export function startTimer() {
  startTime = new Date();
}

export function stopTimer() {
  const endTime = new Date();
  const timeDiff = endTime.getTime() - startTime.getTime();
  return timeDiff;
}

export let fivemPool: mariadb.Pool | undefined;

async function createFivemPool() {
  if (envExists(env.FIVEM_MYSQL_URI)) {
    const pool = mariadb.createPool(env.FIVEM_MYSQL_URI);
    fivemPool = pool;
  } else {
    fivemPool = undefined;
  }
}

export const redisClient = createClient({
  url: env.REDIS_URL,
})
  .on("error", (err) => {
    log.error("Redis Client Error", err);
    process.exit(1);
  })
  .on("ready", () => log.info("Redis Client Ready"));

Start();
