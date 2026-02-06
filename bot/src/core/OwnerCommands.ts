/**
 * OwnerCommands - Simple prefix-based owner-only message commands
 *
 * Commands:
 * - .refreshcommands - Re-register all commands to all guilds
 * - .deletecommands - Delete all commands from all guilds
 * - .purgeredis - Flush all keys from the Redis database
 * - .ping - Simple ping/pong test
 */

import { Events, REST, Routes, type Message } from "discord.js";
import type { HeimdallClient } from "../types/Client";
import type { CommandManager } from "./CommandManager";
import log from "../utils/logger";

export interface OwnerCommandsOptions {
  client: HeimdallClient;
  commandManager: CommandManager;
  prefix: string;
  ownerIds: string[];
  botToken: string;
}

type OwnerCommandHandler = (message: Message, args: string[]) => Promise<void>;

export class OwnerCommands {
  private client: HeimdallClient;
  private commandManager: CommandManager;
  private prefix: string;
  private ownerIds: Set<string>;
  private rest: REST;
  private commands: Map<string, OwnerCommandHandler> = new Map();

  constructor(options: OwnerCommandsOptions) {
    this.client = options.client;
    this.commandManager = options.commandManager;
    this.prefix = options.prefix;
    this.ownerIds = new Set(options.ownerIds);
    this.rest = new REST({ version: "10" }).setToken(options.botToken);

    // Register built-in commands
    this.registerBuiltinCommands();
  }

  /**
   * Register all built-in owner commands
   */
  private registerBuiltinCommands(): void {
    this.commands.set("ping", this.handlePing.bind(this));
    this.commands.set("refreshcommands", this.handleRefreshCommands.bind(this));
    this.commands.set("deletecommands", this.handleDeleteCommands.bind(this));
    this.commands.set("purgeredis", this.handlePurgeRedis.bind(this));
    this.commands.set("help", this.handleHelp.bind(this));
  }

  /**
   * Attach the message handler to the client
   */
  attach(): void {
    this.client.on(Events.MessageCreate, async (message) => {
      // Ignore bots
      if (message.author.bot) return;

      // Check prefix
      if (!message.content.startsWith(this.prefix)) return;

      // Check owner
      if (!this.ownerIds.has(message.author.id)) return;

      // Parse command and args
      const content = message.content.slice(this.prefix.length).trim();
      const [commandName, ...args] = content.split(/\s+/);

      if (!commandName) return;

      const handler = this.commands.get(commandName.toLowerCase());
      if (!handler) return;

      try {
        await handler(message, args);
      } catch (error) {
        log.error(`Owner command ${commandName} failed:`, error);
        await message.reply(`❌ Command failed: ${error instanceof Error ? error.message : "Unknown error"}`).catch(() => {});
      }
    });

    log.info(`OwnerCommands attached (prefix: "${this.prefix}", ${this.commands.size} commands)`);
  }

  // ============================================================================
  // Command Handlers
  // ============================================================================

  /**
   * .ping - Simple ping/pong
   */
  private async handlePing(message: Message): Promise<void> {
    const start = Date.now();
    const reply = await message.reply("🏓 Pong!");
    const latency = Date.now() - start;
    await reply.edit(`🏓 Pong! (${latency}ms, WS: ${this.client.ws.ping}ms)`);
  }

  /**
   * .help - List available owner commands
   */
  private async handleHelp(message: Message): Promise<void> {
    const commandList = Array.from(this.commands.keys())
      .map((cmd) => `\`${this.prefix}${cmd}\``)
      .join(", ");

    await message.reply(`**Owner Commands:**\n${commandList}`);
  }

  /**
   * .refreshcommands - Re-register all commands to all guilds
   */
  private async handleRefreshCommands(message: Message): Promise<void> {
    const statusMsg = await message.reply("🔄 Refreshing commands to all guilds...");

    try {
      await this.commandManager.registerAllCommandsToGuilds();
      const stats = this.commandManager.getStats();

      await statusMsg.edit(`✅ Refreshed ${stats.total} command(s) to ${this.client.guilds.cache.size} guild(s)`);
    } catch (error) {
      await statusMsg.edit(`❌ Failed to refresh commands: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }

  /**
   * .purgeredis - Flush all keys from the Redis database
   */
  private async handlePurgeRedis(message: Message, args: string[]): Promise<void> {
    if (!args.includes("--confirm")) {
      await message.reply(`⚠️ This will **flush all keys** from the Redis database.\nRun \`${this.prefix}purgeredis --confirm\` to confirm.`);
      return;
    }

    const statusMsg = await message.reply("🗑️ Flushing Redis...");

    try {
      await this.client.redis.flushDb();
      await statusMsg.edit("✅ Redis database flushed successfully.");
    } catch (error) {
      await statusMsg.edit(`❌ Failed to flush Redis: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * .deletecommands - Delete all commands from all guilds (and global)
   */
  private async handleDeleteCommands(message: Message, args: string[]): Promise<void> {
    const clientId = this.client.user?.id;
    if (!clientId) {
      await message.reply("❌ Client not ready");
      return;
    }

    // Check for --confirm flag
    if (!args.includes("--confirm")) {
      await message.reply(`⚠️ This will delete ALL commands from ALL guilds and globally.\n` + `Run \`${this.prefix}deletecommands --confirm\` to confirm.`);
      return;
    }

    const statusMsg = await message.reply("🗑️ Deleting all commands...");

    let guildSuccess = 0;
    let guildFail = 0;

    // Delete from all guilds
    for (const [guildId, guild] of this.client.guilds.cache) {
      try {
        await this.rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        guildSuccess++;
      } catch (error) {
        guildFail++;
        log.error(`Failed to delete commands from guild ${guild.name} (${guildId}):`, error);
      }
    }

    // Delete global commands
    try {
      await this.rest.put(Routes.applicationCommands(clientId), { body: [] });
    } catch (error) {
      log.error("Failed to delete global commands:", error);
    }

    await statusMsg.edit(`✅ Deleted commands from ${guildSuccess}/${this.client.guilds.cache.size} guilds` + (guildFail > 0 ? ` (${guildFail} failed)` : "") + `\n✅ Deleted global commands`);
  }
}
