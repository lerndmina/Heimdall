import express from "express";
import cors from "cors";
// import rateLimit from "express-rate-limit"; // Disabled rate limiting
import { CommandHandler } from "../../../command-handler/dist/index";
import { Client } from "discord.js";
import { addRequestId, logRequests } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { createHealthRoutes } from "./routes/health";
import { createModmailRoutes } from "./routes/modmail";
import { createBotInfoRoutes } from "./routes/bot-info";
import log from "../utils/log";
import FetchEnvs from "../utils/FetchEnvs";

const env = FetchEnvs();

export class ApiServer {
  private app: express.Application;
  private server: any;
  private client: Client<true>;
  private handler: CommandHandler;

  constructor(client: Client<true>, handler: CommandHandler) {
    this.app = express();
    this.client = client;
    this.handler = handler;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware() {
    // CORS configuration
    this.app.use(
      cors({
        origin: "*", // Allow all origins for development
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Accept",
          "Origin",
          "Cache-Control",
          "Pragma",
        ],
        exposedHeaders: ["Content-Length", "Content-Range"],
        optionsSuccessStatus: 200,
      })
    );

    // Rate limiting - DISABLED
    // const limiter = rateLimit({
    //   windowMs: 900000, // 15 minutes
    //   max: 100, // 100 requests per window
    //   message: {
    //     error: "Too many requests from this IP, please try again later.",
    //     statusCode: 429,
    //   },
    //   standardHeaders: true,
    //   legacyHeaders: false,
    // });

    // this.app.use("/api", limiter); // Rate limiting disabled

    // Body parsing
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Custom middleware
    this.app.use(addRequestId);
    this.app.use(logRequests);

    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      next();
    });
  }

  private setupRoutes() {
    // API info route
    this.app.get("/api", (req, res) => {
      res.json({
        name: "Heimdall API",
        version: "1.0.0",
        description: "REST API for Heimdall Discord Bot",
        timestamp: new Date().toISOString(),
        endpoints: {
          health: "/api/health",
          "bot-info": "/api/bot-info",
          modmail: {
            threads: "/api/modmail/{guildId}/threads",
            thread: "/api/modmail/{guildId}/threads/{threadId}",
            messages: "/api/modmail/{guildId}/threads/{threadId}/messages",
            stats: "/api/modmail/{guildId}/stats",
            config: "/api/modmail/{guildId}/config",
            "user-tickets": "/api/modmail/user/{userId}/tickets",
          },
        },
        authentication: {
          type: "API Key",
          header: "Authorization",
          format: "Bearer {api_key} or {api_key}",
          scopes: {
            "modmail:read": "Read modmail data",
            "modmail:write": "Read and write modmail data",
            "modmail:admin": "Full modmail administration",
            full: "All permissions",
          },
        },
      });
    });

    // Health routes under /api prefix
    this.app.use("/api", createHealthRoutes(this.client, this.handler));

    // Bot info routes under /api prefix
    this.app.use("/api", createBotInfoRoutes(this.client));

    // Modmail API routes (requires authentication)
    this.app.use("/api/modmail", createModmailRoutes(this.client, this.handler));
  }

  private setupErrorHandling() {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    const port = env.API_PORT;

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, "0.0.0.0", () => {
        log.info(`Heimdall API server running on port ${port}`);
        resolve();
      });

      this.server.on("error", (error: any) => {
        if (error.code === "EADDRINUSE") {
          log.error(`Port ${port} is already in use. Please change API_PORT in your environment.`);
        } else {
          log.error("Failed to start API server:", error);
        }
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          log.info("API server stopped");
          resolve();
        });
      });
    }
  }

  public getApp() {
    return this.app;
  }
}
