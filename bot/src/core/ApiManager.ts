/**
 * ApiManager - Mounts plugin routes and generates OpenAPI docs
 *
 * Handles:
 * - Express server setup
 * - Plugin route mounting under /api/guilds/:guildId
 * - OpenAPI/Swagger documentation generation
 * - Health check endpoint
 */

import express, { Router, type Application, type Request, type Response, type NextFunction } from "express";
import type { Server } from "http";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { ChannelType, PermissionFlagsBits, EmbedBuilder, TextChannel, type Client } from "discord.js";
import log from "../utils/logger";
import { ThingGetter } from "../../plugins/lib/utils/ThingGetter.js";
import DashboardPermission from "../../plugins/dashboard/models/DashboardPermission.js";
import DashboardSettings from "../../plugins/dashboard/models/DashboardSettings.js";
import LoggingConfig, { LoggingCategory } from "../../plugins/logging/models/LoggingConfig.js";

export interface PluginRouter {
  /** Which plugin owns this router */
  pluginName: string;
  /** Route prefix (e.g., "/tickets") */
  prefix: string;
  /** Express router with route handlers */
  router: Router;
  /** Paths to swagger JSDoc files for documentation */
  swaggerPaths?: string[];
}

export class ApiManager {
  private app: Application;
  private routers: PluginRouter[] = [];
  private port: number;
  private started = false;
  private apiKey: string;
  private server: Server | null = null;
  private client: Client | null = null;
  private thingGetter: ThingGetter | null = null;

  /**
   * Set the Discord client reference (called after client is ready).
   * Enables guild-level status checks.
   */
  setClient(client: Client): void {
    this.client = client;
    this.thingGetter = new ThingGetter(client);
  }

  /**
   * Send an audit log embed to the guild's configured audit logging channel.
   * Silently no-ops if the logging plugin isn't configured for this guild.
   */
  private async sendAuditLog(guildId: string, embed: EmbedBuilder): Promise<void> {
    if (!this.client) return;
    try {
      const config = await LoggingConfig.findOne({ guildId, globalEnabled: true });
      if (!config) return;
      const auditCat = config.categories.find((c: any) => c.category === LoggingCategory.AUDIT && c.enabled);
      if (!auditCat) return;
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;
      const channel = guild.channels.cache.get(auditCat.channelId);
      if (!channel?.isTextBased()) return;
      await (channel as TextChannel).send({ embeds: [embed] });
    } catch (err) {
      log.error("[API] Failed to send audit log:", err);
    }
  }

  constructor(port: number = 3001, apiKey: string) {
    this.port = port;
    this.apiKey = apiKey;
    this.app = express();
    this.setupMiddleware();
  }

  /**
   * Setup base middleware
   */
  private setupMiddleware(): void {
    // Request parsing
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      log.debug(`[API] ${req.method} ${req.path}`);
      next();
    });

    // CORS - allow all origins for now (configure properly in production)
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key");

      // Handle OPTIONS preflight
      if (_req.method === "OPTIONS") {
        res.sendStatus(200);
        return;
      }

      next();
    });
  }

  /**
   * Register a router from a plugin
   */
  registerRouter(pluginRouter: PluginRouter): void {
    this.routers.push(pluginRouter);
    log.debug(`Registered API router: ${pluginRouter.prefix} (plugin: ${pluginRouter.pluginName})`);
  }

  /**
   * Mount all registered routers
   */
  private mountRouters(): void {
    // API key auth middleware — applied to all guild-scoped routes
    this.app.use("/api/guilds", (req: Request, res: Response, next: NextFunction) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });

    for (const { prefix, router, pluginName } of this.routers) {
      // Mount under /api/guilds/:guildId{prefix} for guild-scoped routes
      const fullPath = `/api/guilds/:guildId${prefix}`;
      this.app.use(fullPath, router);
      log.debug(`Mounted route: ${fullPath} (${pluginName})`);
    }
  }

  /**
   * Generate and mount OpenAPI/Swagger docs
   */
  private setupSwagger(): void {
    const swaggerSpec = swaggerJSDoc({
      definition: {
        openapi: "3.1.0",
        info: {
          title: "Heimdall v1 API",
          version: "1.0.0",
          description: "Plugin-based Discord bot API",
        },
        servers: [{ url: "/" }],
        components: {
          securitySchemes: {
            ApiKey: {
              type: "apiKey",
              in: "header",
              name: "X-API-Key",
            },
          },
          responses: {
            Unauthorized: {
              description: "Unauthorized - API key required",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "Unauthorized" },
                    },
                  },
                },
              },
            },
            NotFound: {
              description: "Resource not found",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "Not found" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      apis: this.routers.flatMap((r) => r.swaggerPaths || []),
    });

    this.app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    this.app.get("/api-docs.json", (_req: Request, res: Response) => res.json(swaggerSpec));

    log.debug("Swagger documentation mounted at /api-docs");
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: "Not found" });
    });

    // Global error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      log.error("[API] Unhandled error:", err);
      res.status(500).json({ error: "Internal server error" });
    });
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    if (this.started) {
      log.warn("API server already started");
      return;
    }

    this.mountRouters();
    this.setupSwagger();

    // Health check endpoint
    this.app.get("/", (_req: Request, res: Response) => {
      res.json({ status: "ok", version: "1.0.0" });
    });

    // API health check
    this.app.get("/api/health", (_req: Request, res: Response) => {
      res.json({
        status: "ok",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        routers: this.routers.length,
      });
    });

    // Mutual guild check — which of the given guilds is the bot in?
    this.app.post("/api/mutual-guilds", (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!this.client) {
        res.status(503).json({ success: false, error: "Bot not ready" });
        return;
      }

      const { guildIds } = req.body as { guildIds?: string[] };
      if (!Array.isArray(guildIds)) {
        res.status(400).json({ success: false, error: "guildIds must be an array" });
        return;
      }

      const mutualIds = guildIds.filter((id) => this.client!.guilds.cache.has(id));
      res.json({ success: true, data: { mutualIds } });
    });

    // Guild status check — is the bot in this guild?
    this.app.get("/api/guilds/:guildId/status", (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { guildId } = req.params;
      if (!this.client) {
        res.status(503).json({ success: false, error: "Bot not ready" });
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      res.json({
        success: true,
        data: {
          botInGuild: !!guild,
          guildName: guild?.name ?? null,
          memberCount: guild?.memberCount ?? null,
        },
      });
    });

    // Guild text channels — for channel pickers in the dashboard
    this.app.get("/api/guilds/:guildId/channels", (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { guildId } = req.params;
      if (!this.client) {
        res.status(503).json({ success: false, error: "Bot not ready" });
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Guild not found" } });
        return;
      }

      const channels = guild.channels.cache
        .filter((ch) => ch.type === ChannelType.GuildText)
        .sort((a, b) => a.position - b.position)
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          category: ch.parent?.name ?? null,
          categoryId: ch.parentId ?? null,
        }));

      res.json({ success: true, data: { channels } });
    });

    // Guild roles — for role pickers in the dashboard
    this.app.get("/api/guilds/:guildId/roles", (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { guildId } = req.params;
      if (!this.client) {
        res.status(503).json({ success: false, error: "Bot not ready" });
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Guild not found" } });
        return;
      }

      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id) // exclude @everyone
        .sort((a, b) => b.position - a.position) // highest first
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
        }));

      res.json({ success: true, data: { roles } });
    });

    // ── Member info (roles, isOwner, isAdministrator) ──────────
    this.app.get("/api/guilds/:guildId/members/:userId", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { guildId, userId } = req.params;
      if (!this.client) {
        res.status(503).json({ success: false, error: "Bot not ready" });
        return;
      }
      const guild = await this.thingGetter!.getGuild(guildId);
      if (!guild) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Guild not found" } });
        return;
      }

      const member = await this.thingGetter!.getMember(guild, userId);
      if (!member) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Member not found" } });
        return;
      }

      res.json({
        success: true,
        data: {
          roleIds: member.roles.cache.map((r) => r.id),
          isOwner: guild.ownerId === userId,
          isAdministrator: member.permissions.has(PermissionFlagsBits.Administrator),
        },
      });
    });

    // ── Dashboard Permissions CRUD ─────────────────────────────
    // GET all role overrides for a guild
    this.app.get("/api/guilds/:guildId/dashboard-permissions", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      try {
        const docs = await DashboardPermission.find({ guildId: req.params.guildId }).lean();
        res.json({ success: true, data: { permissions: docs } });
      } catch (err) {
        log.error("[API] Error fetching dashboard permissions:", err);
        res.status(500).json({ success: false, error: "Database error" });
      }
    });

    // PUT upsert overrides for a specific role
    this.app.put("/api/guilds/:guildId/dashboard-permissions/:roleId", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { guildId, roleId } = req.params;
      const { roleName, overrides } = req.body as { roleName?: string; overrides?: Record<string, "allow" | "deny"> };
      if (!overrides || typeof overrides !== "object") {
        res.status(400).json({ success: false, error: "overrides is required" });
        return;
      }
      try {
        const doc = await DashboardPermission.findOneAndUpdate(
          { guildId, discordRoleId: roleId },
          { $set: { roleName: roleName ?? roleId, overrides: new Map(Object.entries(overrides)) } },
          { upsert: true, new: true },
        ).lean();
        res.json({ success: true, data: { permission: doc } });

        // Audit log
        const overrideEntries = Object.entries(overrides);
        const summary = overrideEntries.length > 0 ? overrideEntries.map(([k, v]) => `\`${k}\`: **${v}**`).join("\n") : "*All overrides cleared*";
        this.sendAuditLog(
          guildId,
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🛡️ Dashboard Permissions Updated")
            .addFields({ name: "Role", value: `${roleName ?? roleId} (<@&${roleId}>)`, inline: true }, { name: "Overrides", value: summary.slice(0, 1024) })
            .setTimestamp(),
        );
      } catch (err) {
        log.error("[API] Error upserting dashboard permission:", err);
        res.status(500).json({ success: false, error: "Database error" });
      }
    });

    // DELETE overrides for a specific role
    this.app.delete("/api/guilds/:guildId/dashboard-permissions/:roleId", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { guildId, roleId } = req.params;
      try {
        await DashboardPermission.deleteOne({ guildId, discordRoleId: roleId });
        res.json({ success: true });

        // Audit log
        this.sendAuditLog(
          guildId,
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("🛡️ Dashboard Permissions Removed")
            .addFields({ name: "Role", value: `<@&${roleId}>`, inline: true })
            .setTimestamp(),
        );
      } catch (err) {
        log.error("[API] Error deleting dashboard permission:", err);
        res.status(500).json({ success: false, error: "Database error" });
      }
    });

    // ── Dashboard Settings CRUD ────────────────────────────────
    // GET settings for a guild
    this.app.get("/api/guilds/:guildId/dashboard-settings", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      try {
        const doc = await DashboardSettings.findOne({ guildId: req.params.guildId }).lean();
        res.json({
          success: true,
          data: { settings: doc ?? { guildId: req.params.guildId, hideDeniedFeatures: false } },
        });
      } catch (err) {
        log.error("[API] Error fetching dashboard settings:", err);
        res.status(500).json({ success: false, error: "Database error" });
      }
    });

    // PUT update settings
    this.app.put("/api/guilds/:guildId/dashboard-settings", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { guildId } = req.params;
      const { hideDeniedFeatures } = req.body as { hideDeniedFeatures?: boolean };
      try {
        const doc = await DashboardSettings.findOneAndUpdate({ guildId }, { $set: { hideDeniedFeatures: !!hideDeniedFeatures } }, { upsert: true, new: true }).lean();
        res.json({ success: true, data: { settings: doc } });

        // Audit log
        this.sendAuditLog(
          guildId,
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle("⚙️ Dashboard Settings Updated")
            .addFields({
              name: "Hide Denied Features",
              value: hideDeniedFeatures ? "Enabled" : "Disabled",
              inline: true,
            })
            .setTimestamp(),
        );
      } catch (err) {
        log.error("[API] Error updating dashboard settings:", err);
        res.status(500).json({ success: false, error: "Database error" });
      }
    });

    this.setupErrorHandling();

    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        this.started = true;
        log.info(`✅ API server running on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Get the underlying HTTP server (for WebSocket upgrades, etc.)
   */
  getServer(): Server | null {
    return this.server;
  }

  /**
   * Get Express app (for testing or custom middleware)
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * Check if server is started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        if (err) return reject(err);
        this.server = null;
        this.started = false;
        log.debug("API server stopped");
        resolve();
      });
    });
  }

  /**
   * Get stats about registered routers
   */
  getStats(): { routers: number; byPlugin: Record<string, string[]> } {
    const byPlugin: Record<string, string[]> = {};

    for (const router of this.routers) {
      if (!byPlugin[router.pluginName]) {
        byPlugin[router.pluginName] = [];
      }
      byPlugin[router.pluginName]!.push(router.prefix);
    }

    return {
      routers: this.routers.length,
      byPlugin,
    };
  }
}
