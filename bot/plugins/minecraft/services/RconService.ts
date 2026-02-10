/**
 * RconService — Send commands to a Minecraft server via RCON
 *
 * Uses the rcon-client library to connect, send commands, and disconnect.
 * Connections are short-lived (connect → send → disconnect) to avoid stale sockets.
 */

import { Rcon } from "rcon-client";
import { createLogger } from "../../../src/core/Logger.js";
import MinecraftConfig, { decryptRconPassword } from "../models/MinecraftConfig.js";

const log = createLogger("minecraft:rcon");

export interface RconConnectionInfo {
  host: string;
  port: number;
  password: string;
}

export class RconService {
  /**
   * Send a single RCON command to a Minecraft server.
   * Opens a connection, sends the command, then closes.
   */
  static async sendCommand(conn: RconConnectionInfo, command: string): Promise<string> {
    const rcon = new Rcon({
      host: conn.host,
      port: conn.port,
      password: conn.password,
      timeout: 5000,
    });

    try {
      await rcon.connect();
      const response = await rcon.send(command);
      return response;
    } finally {
      try {
        rcon.end();
      } catch {
        // Ignore close errors
      }
    }
  }

  /**
   * Send multiple RCON commands sequentially.
   */
  static async sendCommands(conn: RconConnectionInfo, commands: string[]): Promise<{ command: string; response: string; success: boolean; error?: string }[]> {
    if (commands.length === 0) return [];

    const rcon = new Rcon({
      host: conn.host,
      port: conn.port,
      password: conn.password,
      timeout: 5000,
    });

    const results: { command: string; response: string; success: boolean; error?: string }[] = [];

    try {
      await rcon.connect();

      for (const command of commands) {
        try {
          const response = await rcon.send(command);
          results.push({ command, response, success: true });
        } catch (error) {
          results.push({ command, response: "", success: false, error: String(error) });
          log.error(`RCON command failed: ${command}`, error);
        }
      }
    } catch (error) {
      // Connection-level failure — mark all remaining commands as failed
      log.error("RCON connection failed:", error);
      for (const command of commands) {
        if (!results.find((r) => r.command === command)) {
          results.push({ command, response: "", success: false, error: "RCON connection failed" });
        }
      }
    } finally {
      try {
        rcon.end();
      } catch {
        // Ignore close errors
      }
    }

    return results;
  }

  /**
   * Get RCON connection info for a guild's Minecraft server.
   * Returns null if RCON is not configured/enabled.
   */
  static async getConnectionInfo(guildId: string): Promise<RconConnectionInfo | null> {
    const config = await MinecraftConfig.findOne({ guildId }).lean();
    if (!config?.rconEnabled) return null;

    // Support both encrypted and legacy plaintext passwords
    let password: string | undefined;
    if (config.encryptedRconPassword) {
      try {
        password = decryptRconPassword(config.encryptedRconPassword);
      } catch {
        return null;
      }
    } else if (config.rconPassword) {
      password = config.rconPassword;
    }
    if (!password) return null;

    return {
      host: config.rconHost || config.serverHost || "localhost",
      port: config.rconPort || 25575,
      password,
    };
  }

  /**
   * Apply role sync changes via RCON commands.
   * Uses LuckPerms command templates from the config.
   */
  static async applyRoleSyncViaRcon(
    guildId: string,
    playerName: string,
    groupsToAdd: string[],
    groupsToRemove: string[],
  ): Promise<{ success: boolean; results: { command: string; response: string; success: boolean; error?: string }[] }> {
    const config = await MinecraftConfig.findOne({ guildId }).lean();
    if (!config?.rconEnabled) {
      return { success: false, results: [{ command: "", response: "RCON not configured", success: false, error: "RCON not configured" }] };
    }

    let password: string | undefined;
    if (config.encryptedRconPassword) {
      try {
        password = decryptRconPassword(config.encryptedRconPassword);
      } catch {
        /* ignore */
      }
    } else if (config.rconPassword) {
      password = config.rconPassword;
    }
    if (!password) {
      return { success: false, results: [{ command: "", response: "RCON password not configured", success: false, error: "RCON password not configured" }] };
    }

    const addTemplate = config.roleSync?.rconAddCommand || "lp user {player} parent add {group}";
    const removeTemplate = config.roleSync?.rconRemoveCommand || "lp user {player} parent remove {group}";

    const commands: string[] = [];

    // Remove old groups first, then add new ones
    for (const group of groupsToRemove) {
      commands.push(removeTemplate.replace(/\{player\}/g, playerName).replace(/\{group\}/g, group));
    }
    for (const group of groupsToAdd) {
      commands.push(addTemplate.replace(/\{player\}/g, playerName).replace(/\{group\}/g, group));
    }

    if (commands.length === 0) {
      return { success: true, results: [] };
    }

    const conn = await RconService.getConnectionInfo(guildId);
    if (!conn) {
      return { success: false, results: [{ command: "", response: "RCON not configured", success: false, error: "RCON not configured" }] };
    }

    log.info(`Sending ${commands.length} RCON role sync commands for ${playerName} in guild ${guildId}`);
    const results = await RconService.sendCommands(conn, commands);
    const allSuccess = results.every((r) => r.success);

    return { success: allSuccess, results };
  }

  /**
   * Test RCON connectivity to a server.
   */
  static async testConnection(conn: RconConnectionInfo): Promise<{ success: boolean; message: string }> {
    try {
      const response = await RconService.sendCommand(conn, "list");
      return { success: true, message: response };
    } catch (error) {
      return { success: false, message: `Connection failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
