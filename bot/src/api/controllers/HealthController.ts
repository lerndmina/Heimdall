import { CommandHandler } from "@heimdall/command-handler";
import { Client } from "discord.js";
import mongoose from "mongoose";
import { redisClient } from "../../Bot";
import type { HealthStatus, HealthComponent } from "../types/api";

/**
 * Get comprehensive health status for the API
 */
export function getHealthStatus(client: Client<true>, handler: CommandHandler): HealthStatus {
  const components = {
    discord: testDiscordConnection(client),
    database: testDatabaseConnection(),
    redis: testRedisConnection(),
    commands: testCommandsStatus(handler),
  };

  // Determine overall health
  const isHealthy = Object.values(components).every((component) => component.status === "healthy");

  return {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    components,
  };
}

/**
 * Test the Discord client connection
 */
function testDiscordConnection(client: Client<true>): HealthComponent {
  const isConnected = client.ws.status === 0;
  return {
    status: isConnected ? "healthy" : "unhealthy",
    details: isConnected ? `Connected (${client.ws.ping}ms)` : "Disconnected",
    ping: client.ws.ping,
    readyAt: client.readyAt?.toISOString(),
    uptime: client.uptime,
  };
}

/**
 * Test the MongoDB connection
 */
function testDatabaseConnection(): HealthComponent {
  const readyState = mongoose.connection.readyState;
  const stateMap: { [key: number]: string } = {
    0: "Disconnected",
    1: "Connected",
    2: "Connecting",
    3: "Disconnecting",
    99: "Uninitialized",
  };

  return {
    status: readyState === 1 ? "healthy" : "unhealthy",
    details: stateMap[readyState] || "unknown",
    readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}

/**
 * Test the Redis connection
 */
function testRedisConnection(): HealthComponent {
  try {
    const isReady = redisClient.isReady;
    return {
      status: isReady ? "healthy" : "unhealthy",
      details: isReady ? "Connected" : "Disconnected",
      isReady,
      isOpen: redisClient.isOpen,
    };
  } catch (error: any) {
    return {
      status: "unhealthy",
      details: `Error: ${error.message || error}`,
    };
  }
}

/**
 * Test the command system status
 */
function testCommandsStatus(handler: CommandHandler): HealthComponent {
  const commandCount = handler.getCommands().size;
  return {
    status: commandCount > 0 ? "healthy" : "unhealthy",
    details: `${commandCount} commands loaded`,
    loaded: commandCount,
  };
}
