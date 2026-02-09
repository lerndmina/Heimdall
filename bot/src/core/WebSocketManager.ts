import { WebSocketServer, WebSocket } from "ws";
import type { HeimdallClient } from "../types/Client.js";
import type { RedisClientType } from "redis";
import DashboardPermission from "../../plugins/dashboard/models/DashboardPermission.js";
import { createLogger } from "./Logger.js";

const log = createLogger("ws");

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  accessToken?: string;
  guildIds: Set<string>;
  isAlive: boolean;
}

interface ClientMessage {
  type: "auth" | "subscribe" | "unsubscribe" | "ping";
  token?: string;
  guildId?: string;
}

interface DiscordUser {
  id: string;
  username: string;
}

interface DiscordGuild {
  id: string;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private guildRooms = new Map<string, Set<AuthenticatedSocket>>();
  private heartbeatInterval: NodeJS.Timer | null = null;

  constructor(
    private port: number,
    private client: HeimdallClient,
    private redis?: RedisClientType,
  ) {}

  async start(): Promise<void> {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on("connection", (ws, req) => {
      const socket = ws as AuthenticatedSocket;
      socket.guildIds = new Set();
      socket.isAlive = true;

      ws.on("pong", () => {
        socket.isAlive = true;
      });

      ws.on("message", (raw) => {
        this.handleMessage(socket, raw);
      });

      ws.on("close", () => {
        this.handleDisconnect(socket);
      });

      ws.on("error", (err) => {
        log.warn("WebSocket error:", err);
      });

      this.send(socket, "connected", { message: "Authenticate with { type: 'auth', token: '<access-token>' }" });
    });

    this.startHeartbeat();

    if (this.redis) {
      void this.setupRedis();
    }

    log.info(`WebSocket server listening on port ${this.port}`);
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.wss) {
      await new Promise<void>((resolve, reject) => {
        this.wss!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.wss = null;
    }
  }

  broadcastToGuild(guildId: string, event: string, data: unknown): void {
    const room = this.guildRooms.get(guildId);
    if (!room || room.size === 0) return;

    const message = JSON.stringify({ event, data, guildId, timestamp: Date.now() });

    for (const socket of room) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }

  private async handleMessage(socket: AuthenticatedSocket, raw: WebSocket.RawData): Promise<void> {
    let message: ClientMessage;

    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      this.send(socket, "error", { code: "INVALID_JSON", message: "Invalid JSON" });
      return;
    }

    if (message.type === "ping") {
      this.send(socket, "pong", {});
      return;
    }

    if (message.type === "auth") {
      if (!message.token) {
        this.send(socket, "error", { code: "MISSING_TOKEN", message: "Missing auth token" });
        socket.close();
        return;
      }

      const user = await this.fetchDiscordUser(message.token);
      if (!user) {
        this.send(socket, "error", { code: "INVALID_TOKEN", message: "Invalid or expired token" });
        socket.close();
        return;
      }

      socket.userId = user.id;
      socket.accessToken = message.token;

      this.send(socket, "authenticated", { userId: user.id, username: user.username });
      return;
    }

    if (message.type === "subscribe") {
      if (!socket.userId || !socket.accessToken) {
        this.send(socket, "error", { code: "NOT_AUTHENTICATED", message: "Authenticate before subscribing" });
        return;
      }

      const guildId = message.guildId;
      if (!guildId) {
        this.send(socket, "error", { code: "MISSING_GUILD", message: "Missing guildId" });
        return;
      }

      const allowed = await this.canAccessGuild(socket, guildId);
      if (!allowed) {
        this.send(socket, "error", { code: "FORBIDDEN", message: "No access to this guild" });
        return;
      }

      this.joinGuild(socket, guildId);
      this.send(socket, "subscribed", { guildId });
      return;
    }

    if (message.type === "unsubscribe") {
      const guildId = message.guildId;
      if (!guildId) {
        this.send(socket, "error", { code: "MISSING_GUILD", message: "Missing guildId" });
        return;
      }

      this.leaveGuild(socket, guildId);
      this.send(socket, "unsubscribed", { guildId });
    }
  }

  private joinGuild(socket: AuthenticatedSocket, guildId: string): void {
    if (!this.guildRooms.has(guildId)) {
      this.guildRooms.set(guildId, new Set());
    }

    this.guildRooms.get(guildId)!.add(socket);
    socket.guildIds.add(guildId);
  }

  private leaveGuild(socket: AuthenticatedSocket, guildId: string): void {
    const room = this.guildRooms.get(guildId);
    if (room) {
      room.delete(socket);
      if (room.size === 0) {
        this.guildRooms.delete(guildId);
      }
    }
    socket.guildIds.delete(guildId);
  }

  private handleDisconnect(socket: AuthenticatedSocket): void {
    for (const guildId of socket.guildIds) {
      this.leaveGuild(socket, guildId);
    }
  }

  private send(socket: AuthenticatedSocket, event: string, data: unknown): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ event, data, timestamp: Date.now() }));
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;

      for (const socket of this.wss.clients) {
        const ws = socket as AuthenticatedSocket;
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30_000);
  }

  private async fetchDiscordUser(accessToken: string): Promise<DiscordUser | null> {
    try {
      const res = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) return null;
      const data = (await res.json()) as DiscordUser;
      return data?.id ? data : null;
    } catch {
      return null;
    }
  }

  private async fetchUserGuildIds(accessToken: string): Promise<Set<string>> {
    try {
      const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) return new Set();
      const data = (await res.json()) as DiscordGuild[];
      return new Set((data || []).map((g) => g.id));
    } catch {
      return new Set();
    }
  }

  private async canAccessGuild(socket: AuthenticatedSocket, guildId: string): Promise<boolean> {
    if (!socket.userId || !socket.accessToken) return false;

    const ownerIds = (process.env.OWNER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ownerIds.includes(socket.userId)) return true;

    const guildIds = await this.fetchUserGuildIds(socket.accessToken);
    if (!guildIds.has(guildId)) return false;

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return false;

    let member;
    try {
      member = await guild.members.fetch(socket.userId);
    } catch {
      return false;
    }

    if (!member) return false;
    if (guild.ownerId === socket.userId) return true;

    const permDocs = await DashboardPermission.find({ guildId }).lean();
    if (permDocs.length === 0) return true;

    const denyRoles = permDocs
      .filter((doc) => (doc.overrides as Record<string, string> | undefined)?.["_deny_access"])
      .map((doc) => ({
        roleId: doc.discordRoleId,
        value: (doc.overrides as Record<string, string>)["_deny_access"],
        position: guild.roles.cache.get(doc.discordRoleId)?.position ?? 0,
      }))
      .filter((doc) => member.roles.cache.has(doc.roleId))
      .sort((a, b) => b.position - a.position);

    if (denyRoles.length === 0) return true;

    return denyRoles[0]?.value !== "deny";
  }

  private async setupRedis(): Promise<void> {
    // Placeholder for future Redis pub/sub fanout
  }
}
