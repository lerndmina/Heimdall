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
import crypto from "crypto";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { ChannelType, PermissionFlagsBits, EmbedBuilder, TextChannel, type Client } from "discord.js";
import log from "../utils/logger";
import { broadcastDashboardChange } from "./broadcast";
import { resolveRouteAction } from "./dashboardRoutePermissions";
import { ThingGetter } from "../../plugins/lib/utils/ThingGetter.js";
import { DASHBOARD_TEXT_CHANNEL_TYPES } from "../../plugins/lib/utils/channelTypes.js";
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

    // Reject obviously weak API keys at startup
    this.validateApiKeyStrength(apiKey);

    this.setupMiddleware();
  }

  /**
   * Validate that the API key meets minimum security requirements.
   * Rejects keys that are too short, use trivial patterns, or have low entropy.
   */
  private validateApiKeyStrength(key: string): void {
    const warnings: string[] = [];

    if (key.length < 32) {
      warnings.push(`INTERNAL_API_KEY is only ${key.length} chars (minimum 32 recommended)`);
    }

    // Check for all-same-character keys like "aaaa..." or "1111..."
    if (/^(.)\1+$/.test(key)) {
      warnings.push("INTERNAL_API_KEY consists of a single repeated character");
    }

    // Check for trivially guessable patterns
    const trivial = ["password", "secret", "apikey", "changeme", "test", "1234", "abcd"];
    if (trivial.some((t) => key.toLowerCase().includes(t))) {
      warnings.push("INTERNAL_API_KEY contains a trivially guessable pattern");
    }

    // Check for low character diversity (e.g. only digits)
    const uniqueChars = new Set(key).size;
    if (uniqueChars < 8) {
      warnings.push(`INTERNAL_API_KEY has very low character diversity (${uniqueChars} unique chars)`);
    }

    if (warnings.length > 0) {
      log.warn("⚠️  Weak INTERNAL_API_KEY detected:");
      for (const w of warnings) {
        log.warn(`   - ${w}`);
      }
      log.warn("   Generate a strong key: openssl rand -hex 32");
    }
  }

  /**
   * Constant-time API key verification to prevent timing attacks.
   */
  private verifyApiKey(key: string): boolean {
    try {
      const keyBuf = Buffer.from(key);
      const expectedBuf = Buffer.from(this.apiKey);
      if (keyBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(keyBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  /**
   * Setup base middleware
   */
  private setupMiddleware(): void {
    // Trust proxy configuration for accurate client IPs behind reverse proxies.
    // Defaults to 1 (first upstream proxy) to support common Docker/nginx setups.
    const trustProxyRaw = (process.env.TRUST_PROXY ?? "1").trim().toLowerCase();
    let trustProxySetting: boolean | number | string;
    if (trustProxyRaw === "true") {
      trustProxySetting = true;
    } else if (trustProxyRaw === "false") {
      trustProxySetting = false;
    } else if (/^\d+$/.test(trustProxyRaw)) {
      trustProxySetting = Number(trustProxyRaw);
    } else {
      trustProxySetting = trustProxyRaw;
    }
    this.app.set("trust proxy", trustProxySetting);

    // Request parsing — default 1MB limit for most routes
    this.app.use(express.json({ limit: "1mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "1mb" }));

    // Shared key generator: prefer X-User-Id (dashboard), fall back to IP (with IPv6 subnet normalization)
    const dashboardOrIpKey = (req: Request) => {
      const userId = req.header("X-User-Id");
      if (userId) return userId;
      return ipKeyGenerator(req.ip ?? "unknown");
    };

    // Global rate limiting — 100 requests/minute, keyed by X-User-Id (dashboard) or IP (external)
    this.app.use(
      rateLimit({
        windowMs: 60_000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: dashboardOrIpKey,
        message: { error: "Too many requests, please try again later" },
      }),
    );

    // Stricter rate limit for auth endpoints — 20 requests/minute
    this.app.use(
      "/api/dashboard-access",
      rateLimit({
        windowMs: 60_000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: dashboardOrIpKey,
        message: { error: "Too many requests, please try again later" },
      }),
    );

    // Stricter rate limit for mutation routes — 30 requests/minute (hoisted to avoid per-request instantiation)
    const mutationLimiter = rateLimit({
      windowMs: 60_000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: dashboardOrIpKey,
      message: { error: "Too many write requests, please try again later" },
    });
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        return mutationLimiter(req, _res, next);
      }
      next();
    });

    // Request logging + slow-request timing
    // Logs all requests at DEBUG level; warns on anything over SLOW_REQUEST_THRESHOLD.
    const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_THRESHOLD_MS ?? 500);
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      log.debug(`[API] ${req.method} ${req.path}`);
      res.on("finish", () => {
        const ms = Date.now() - start;
        if (ms >= SLOW_REQUEST_MS) {
          log.warn(`[API] SLOW ${req.method} ${req.path} — ${ms}ms (status ${res.statusCode})`);
        }
      });
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

    // CORS — restrict to dashboard origin only
    const dashboardUrl = process.env.DASHBOARD_URL || `http://localhost:${process.env.DASHBOARD_PORT || "3000"}`;
    if (process.env.NODE_ENV === "production" && !process.env.DASHBOARD_URL) {
      log.warn("DASHBOARD_URL is not set — CORS origin defaults to localhost. Set DASHBOARD_URL in production.");
    }
    this.app.use(
      cors({
        origin: dashboardUrl,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization", "X-API-Key", "X-User-Id"],
        credentials: true,
      }),
    );
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
    // Higher body size limit for bulk import and migration routes
    this.app.use("/api/guilds/:guildId/minecraft/import-whitelist", express.json({ limit: "10mb" }));
    this.app.use("/api/dev/migrate", express.json({ limit: "10mb" }));
    this.app.use("/api/dev/clone", express.json({ limit: "10mb" }));
    this.app.use("/api/dev/drop", express.json());

    // API key auth middleware — applied to all guild-scoped routes
    this.app.use("/api/guilds", (req: Request, res: Response, next: NextFunction) => {
      const key = req.header("X-API-Key");
      if (!key || !this.verifyApiKey(key)) {
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

    // Gate Swagger docs behind API key authentication
    const swaggerAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
      const key = req.header("X-API-Key");
      if (!key || !this.verifyApiKey(key)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    };
    this.app.use("/api-docs", swaggerAuthMiddleware, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    this.app.get("/api-docs.json", swaggerAuthMiddleware, (_req: Request, res: Response) => res.json(swaggerSpec));

    log.debug("Swagger documentation mounted at /api-docs (auth required)");
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
    this.app.use((err: Error & { name?: string; errors?: Record<string, { message: string; path: string }> }, _req: Request, res: Response, _next: NextFunction) => {
      log.error("[API] Unhandled error:", err);

      // Handle Mongoose validation errors with structured 400 responses
      if (err.name === "ValidationError" && err.errors) {
        const fields = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Validation failed: " + fields.map((f) => f.message).join(", "),
            fields,
          },
        });
        return;
      }

      res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
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

    // Health check endpoint — no sensitive info exposed publicly
    this.app.get("/", (_req: Request, res: Response) => {
      res.json({ status: "ok" });
    });

    // API health check — no version/router count exposed publicly
    this.app.get("/api/health", (_req: Request, res: Response) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    });

    // Bot owner check — is the authenticated user a bot owner?
    this.app.get("/api/bot-owner", (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || !this.verifyApiKey(key)) {
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
      if (!key || !this.verifyApiKey(key)) {
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
      if (!key || !this.verifyApiKey(key)) {
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
        const permsByGuild = new Map<string, Array<{ discordRoleId: string; overrides: Record<string, string> }>>();
        for (const perm of allPerms) {
          const list = permsByGuild.get(perm.guildId) ?? [];
          list.push({ discordRoleId: perm.discordRoleId, overrides: (perm.overrides as Record<string, string>) ?? {} });
          permsByGuild.set(perm.guildId, list);
        }

        const ownerIds = (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean);
        const accessibleGuildIds: string[] = [];

        for (const guildId of guildIds) {
          if (!this.client) continue;
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) continue;

          const member = await this.thingGetter?.getMember(guild, userId);
          if (!member) continue;

          // Bot owners, guild owners, and administrators always have access
          const isOwner = guild.ownerId === userId || ownerIds.includes(userId);
          const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
          if (isOwner || isAdmin) {
            accessibleGuildIds.push(guildId);
            continue;
          }

          // Check role-based permissions
          const rolePerms = permsByGuild.get(guildId);
          if (!rolePerms || rolePerms.length === 0) {
            // Default-closed: no permission docs = no access for non-admins
            continue;
          }

          const memberRoleIds = member.roles.cache.map((r) => r.id);
          const userRoleOverrides = rolePerms.filter((p) => memberRoleIds.includes(p.discordRoleId));

          if (userRoleOverrides.length === 0) continue;

          // Check _deny_access using role hierarchy (highest-positioned role wins)
          const sortedOverrides = userRoleOverrides
            .map((p) => ({
              ...p,
              position: guild.roles.cache.get(p.discordRoleId)?.position ?? 0,
            }))
            .sort((a, b) => b.position - a.position);

          let hasDeny = false;
          for (const p of sortedOverrides) {
            const val = p.overrides["_deny_access"];
            if (val) {
              hasDeny = val === "deny";
              break;
            }
          }
          if (hasDeny) continue;

          accessibleGuildIds.push(guildId);
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
      if (!key || !this.verifyApiKey(key)) {
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
        const isProduction = process.env.NODE_ENV === "production";
        const safeMessage = isProduction ? "Migration failed" : error.message || "Migration failed";
        // If headers already sent (SSE mode), send error as event
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({ type: "error", message: safeMessage })}\n\n`);
          res.end();
        } else {
          res.status(500).json({
            success: false,
            error: {
              code: "MIGRATION_FAILED",
              message: safeMessage,
            },
          });
        }
      }
    });

    // Dev clone endpoint — clone data from another Heimdall instance (owner only)
    this.app.post("/api/dev/clone", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || !this.verifyApiKey(key)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userId = req.header("X-User-Id");
      const ownerIds = (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean);

      if (!userId || !ownerIds.includes(userId)) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Only the bot owner can execute clone migrations",
          },
        });
        return;
      }

      const { sourceDbUri, guildId } = req.body;

      if (!sourceDbUri || typeof sourceDbUri !== "string") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "sourceDbUri is required",
          },
        });
        return;
      }

      try {
        const { runCloneMigration } = await import("../../plugins/dev/utils/cloneMigration.js");
        const { broadcastToOwners } = await import("./broadcast.js");

        const stats = await runCloneMigration({
          sourceDbUri,
          guildId,
          onProgress: (event: any) => {
            broadcastToOwners(`migration:${event.step === "complete" ? "complete" : event.result ? "step_complete" : "step_start"}`, {
              mode: "clone",
              ...event,
            });
          },
        });

        res.json({ success: true, data: stats });
      } catch (error: any) {
        log.error("[API] Clone migration failed:", error);
        const isProduction = process.env.NODE_ENV === "production";
        const safeMessage = isProduction ? "Clone migration failed" : error.message || "Clone migration failed";
        res.status(500).json({
          success: false,
          error: {
            code: "CLONE_FAILED",
            message: safeMessage,
          },
        });
      }
    });

    // Dev drop endpoint — wipe all Heimdall-managed collections (owner only)
    this.app.delete("/api/dev/drop", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || !this.verifyApiKey(key)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userId = req.header("X-User-Id");
      const ownerIds = (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean);

      if (!userId || !ownerIds.includes(userId)) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Only the bot owner can drop all data",
          },
        });
        return;
      }

      // Require explicit confirmation header
      const confirm = req.header("X-Confirm-Drop");
      if (confirm !== "DROP ALL DATA") {
        res.status(400).json({
          success: false,
          error: {
            code: "CONFIRMATION_REQUIRED",
            message: "Missing X-Confirm-Drop header with value 'DROP ALL DATA'",
          },
        });
        return;
      }

      try {
        const { dropAllCollections } = await import("../../plugins/dev/utils/dropCollections.js");
        const { broadcastToOwners } = await import("./broadcast.js");

        const results = await dropAllCollections({
          onProgress: (event: any) => {
            broadcastToOwners(`drop:${event.result ? "step_complete" : "step_start"}`, event);
          },
        });

        const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0);

        res.json({ success: true, data: { results, totalDeleted } });
      } catch (error: any) {
        log.error("[API] Drop all data failed:", error);
        const isProduction = process.env.NODE_ENV === "production";
        const safeMessage = isProduction ? "Drop all data failed" : error.message || "Drop all data failed";
        res.status(500).json({
          success: false,
          error: {
            code: "DROP_FAILED",
            message: safeMessage,
          },
        });
      }
    });

    // Guild status check — is the bot in this guild?
    this.app.get("/api/guilds/:guildId/status", (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || !this.verifyApiKey(key)) {
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
    this.app.get("/api/guilds/:guildId/channels", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || !this.verifyApiKey(key)) {
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
      const textLikeTypes: ChannelType[] = [...DASHBOARD_TEXT_CHANNEL_TYPES];

      const typeMap: Record<string, ChannelType[]> = {
        text: textLikeTypes,
        voice: [ChannelType.GuildVoice],
        category: [ChannelType.GuildCategory],
        forum: [ChannelType.GuildForum],
        all: [...textLikeTypes, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildStageVoice],
      };

      const allowedTypes = typeMap[typeFilter] ?? [ChannelType.GuildText];

      let channelCollection = guild.channels.cache;
      try {
        // Ensure forum/media channels are included even if cache is cold/incomplete.
        const fetchedChannels = await guild.channels.fetch();
        channelCollection = fetchedChannels.filter((ch): ch is NonNullable<typeof ch> => !!ch);
      } catch (error) {
        log.warn(`[API] Failed to fully fetch channels for guild ${guildId}, falling back to cache:`, error);
      }

      const channels = channelCollection
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
      if (!key || !this.verifyApiKey(key)) {
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
          isAdministrator: r.permissions.has(PermissionFlagsBits.Administrator),
        }));

      res.json({ success: true, data: { roles } });
    });

    // ── Member info (roles, isOwner, isAdministrator) ──────────
    this.app.get("/api/guilds/:guildId/members/:userId", async (req: Request, res: Response) => {
      const key = req.header("X-API-Key");
      if (!key || !this.verifyApiKey(key)) {
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
      if (!key || !this.verifyApiKey(key)) {
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
      if (!key || !this.verifyApiKey(key)) {
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
      if (!key || !this.verifyApiKey(key)) {
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
      if (!key || !this.verifyApiKey(key)) {
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
      if (!key || !this.verifyApiKey(key)) {
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
      if (!key || !this.verifyApiKey(key)) {
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
