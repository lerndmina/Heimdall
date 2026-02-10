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
import { broadcastDashboardChange } from "./broadcast";
import { resolveRouteAction } from "./dashboardRoutePermissions";
import { ThingGetter } from "../../plugins/lib/utils/ThingGetter.js";
import DashboardPermission from "../../plugins/dashboard/models/DashboardPermission.js";
import DashboardSettings from "../../plugins/dashboard/models/DashboardSettings.js";
import LoggingConfig, { LoggingCategory } from "../../plugins/logging/models/LoggingConfig.js";
import { permissionRegistry } from "./PermissionRegistry.js";

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

    // Broadcast successful writes for live dashboard refresh
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const method = req.method.toUpperCase();
      const shouldBroadcast = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

      if (!shouldBroadcast) {
        next();
        return;
      }

      const path = req.path;
      res.on("finish", () => {
        if (res.statusCode >= 400) return;
        const match = path.match(/^\/api\/guilds\/([^/]+)/);
        if (!match) return;
        const guildId = match[1] ?? "";
        if (!guildId) return;
        const pathSegments = path.split("/").filter(Boolean).slice(3);
        const plugin = pathSegments[0] || "unknown";
        const requiredAction = resolveRouteAction(method, pathSegments) ?? undefined;
        const type = `api_${method.toLowerCase()}`;
        broadcastDashboardChange(guildId, plugin, type, {
          requiredAction,
          data: { method, path },
        });
      });

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

    // Bot owner check — is the authenticated user a bot owner?
    this.app.get("/api/bot-owner", (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userId = req.header("X-User-Id");
      const ownerIds = (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Not authenticated",
          },
        });
        return;
      }

      const isBotOwner = ownerIds.includes(userId);

      res.json({
        success: true,
        data: {
          isBotOwner,
          userId,
        },
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

    // Dashboard access check — which of the given guilds does the user have dashboard permissions in?
    // Takes a userId + guildIds array, checks if the user has any role with dashboard permission
    // overrides configured in each guild.
    this.app.post("/api/dashboard-access", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { userId, guildIds } = req.body as { userId?: string; guildIds?: string[] };
      if (!userId || !Array.isArray(guildIds)) {
        res.status(400).json({ success: false, error: "userId and guildIds[] are required" });
        return;
      }

      try {
        // Find all guilds that have any dashboard permission overrides configured
        const allPerms = await DashboardPermission.find({ guildId: { $in: guildIds } }).lean();

        // Group by guildId
        const permsByGuild = new Map<string, Array<{ discordRoleId: string }>>();
        for (const perm of allPerms) {
          const list = permsByGuild.get(perm.guildId) ?? [];
          list.push({ discordRoleId: perm.discordRoleId });
          permsByGuild.set(perm.guildId, list);
        }

        // For each guild with overrides, check if the user has any of those roles
        const accessibleGuildIds: string[] = [];

        for (const [guildId, rolePerms] of permsByGuild) {
          if (!this.client) continue;
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) continue;

          const member = await this.thingGetter?.getMember(guild, userId);
          if (!member) continue;

          const memberRoleIds = member.roles.cache.map((r) => r.id);
          const hasOverriddenRole = rolePerms.some((p) => memberRoleIds.includes(p.discordRoleId));
          if (hasOverriddenRole) {
            accessibleGuildIds.push(guildId);
          }
        }

        res.json({ success: true, data: { accessibleGuildIds } });
      } catch (err) {
        log.error("[API] Error checking dashboard access:", err);
        res.status(500).json({ success: false, error: "Database error" });
      }
    });

    // Dev migration endpoint — import data from old bot (owner only)
    this.app.post("/api/dev/migrate", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Only allow bot owner to run migrations
      const userId = req.header("X-User-Id");
      const ownerIds = (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean);

      if (!userId || !ownerIds.includes(userId)) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Only the bot owner can execute migrations",
          },
        });
        return;
      }

      const { oldDbUri, guildId, categoryMapping, importOpenThreads, skipModmail, modmailCollection } = req.body;

      if (!oldDbUri || typeof oldDbUri !== "string") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "oldDbUri is required",
          },
        });
        return;
      }

      try {
        // Dynamically import the migration function
        const { runFullMigration } = await import("../../plugins/dev/utils/migration.js");

        // Use SSE to stream progress
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const stats = await runFullMigration({
          oldDbUri,
          guildId,
          categoryMapping,
          importOpenThreads: importOpenThreads === true,
          skipModmail: skipModmail === true,
          modmailCollection: typeof modmailCollection === "string" && modmailCollection.trim() ? modmailCollection.trim() : undefined,
          onProgress: (event: any) => {
            res.write(`data: ${JSON.stringify({ type: "progress", ...event })}\n\n`);
          },
        });

        res.write(`data: ${JSON.stringify({ type: "complete", stats })}\n\n`);
        res.end();
      } catch (error: any) {
        log.error("[API] Migration failed:", error);
        // If headers already sent (SSE mode), send error as event
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({ type: "error", message: error.message || "Migration failed" })}\n\n`);
          res.end();
        } else {
          res.status(500).json({
            success: false,
            error: {
              code: "MIGRATION_FAILED",
              message: error.message || "Migration failed",
            },
          });
        }
      }
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

      const guild = this.client.guilds.cache.get(guildId as string);
      res.json({
        success: true,
        data: {
          botInGuild: !!guild,
          guildName: guild?.name ?? null,
          memberCount: guild?.memberCount ?? null,
        },
      });
    });

    // Guild channels — for channel pickers in the dashboard
    // Supports ?type=text|voice|category|all (default: text)
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

      const guild = this.client.guilds.cache.get(guildId as string);
      if (!guild) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Guild not found" } });
        return;
      }

      const typeFilter = (req.query.type as string) || "text";
      const typeMap: Record<string, ChannelType[]> = {
        text: [ChannelType.GuildText],
        voice: [ChannelType.GuildVoice],
        category: [ChannelType.GuildCategory],
        all: [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildForum, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice],
      };

      const allowedTypes = typeMap[typeFilter] ?? [ChannelType.GuildText];

      const channels = guild.channels.cache
        .filter((ch) => allowedTypes.includes(ch.type))
        .sort((a, b) => ("position" in a ? a.position : 0) - ("position" in b ? b.position : 0))
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
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

      const guild = this.client.guilds.cache.get(guildId as string);
      if (!guild) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Guild not found" } });
        return;
      }

      const includeEveryone = String(req.query.includeEveryone ?? "").toLowerCase() === "true";

      const roles = guild.roles.cache
        .filter((r) => includeEveryone || r.id !== guild.id) // exclude @everyone unless requested
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
      const guild = await this.thingGetter!.getGuild(guildId as string);
      if (!guild) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Guild not found" } });
        return;
      }

      const member = await this.thingGetter!.getMember(guild, userId as string);
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
        // Enrich with Discord role position for hierarchy-based resolution
        const guild = this.client?.guilds.cache.get(req.params.guildId as string);
        const enriched = docs.map((doc) => {
          const role = guild?.roles.cache.get(doc.discordRoleId);
          return { ...doc, position: role?.position ?? 0 };
        });
        res.json({ success: true, data: { permissions: enriched } });
      } catch (err) {
        log.error("[API] Error fetching dashboard permissions:", err);
        res.status(500).json({ success: false, error: "Database error" });
      }
    });

    // ── Permission Definitions (dynamic) ───────────────────────
    this.app.get("/api/guilds/:guildId/permission-defs", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || key !== this.apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      try {
        const categories = await permissionRegistry.getCategories(req.params.guildId as string);
        res.json({ success: true, data: { categories } });
      } catch (err) {
        log.error("[API] Error fetching permission definitions:", err);
        res.status(500).json({ success: false, error: "Failed to load permission definitions" });
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
        const doc = await DashboardPermission.findOneAndUpdate({ guildId, discordRoleId: roleId }, { $set: { roleName: roleName ?? roleId, overrides } }, { upsert: true, new: true }).lean();
        res.json({ success: true, data: { permission: doc } });

        // Audit log
        const overrideEntries = Object.entries(overrides);
        const summary = overrideEntries.length > 0 ? overrideEntries.map(([k, v]) => `\`${k}\`: **${v}**`).join("\n") : "*All overrides cleared*";
        this.sendAuditLog(
          guildId as string,
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
          guildId as string,
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
          guildId as string,
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
