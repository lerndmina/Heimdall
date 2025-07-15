import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { validateApiKey, hasScope } from "../../utils/api/apiKeyUtils";
import { createErrorResponse } from "../utils/apiResponse";
import log from "../../utils/log";
import envs from "../../utils/FetchEnvs";

// Extend Express Request to include API key info
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      apiKey?: {
        keyId: string;
        name: string;
        scopes: string[];
        createdAt: Date;
        lastUsed: Date | null;
        isActive: boolean;
        expiresAt: Date | null;
      };
    }
  }
}

/**
 * Add request ID to all requests
 */
export function addRequestId(req: Request, res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
}

/**
 * API Key authentication middleware
 */
export async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res
        .status(401)
        .json(createErrorResponse("Missing Authorization header", 401, req.requestId));
    }

    // Support both "Bearer <key>" and "<key>" formats
    let apiKey: string;
    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else {
      apiKey = authHeader; // Use the header value directly
    }

    const validation = await validateApiKey(apiKey);

    if (!validation.isValid) {
      log.warn(`Invalid API key attempt from ${req.ip}: ${validation.error}`);
      return res
        .status(401)
        .json(createErrorResponse(validation.error || "Invalid API key", 401, req.requestId));
    }

    req.apiKey = validation.keyInfo;
    log.debug(
      `API request authenticated: ${validation.keyInfo!.keyId} (${validation.keyInfo!.name})`
    );

    next();
  } catch (error) {
    log.error("Error in API key authentication:", error);
    return res.status(500).json(createErrorResponse("Internal server error", 500, req.requestId));
  }
}

/**
 * Check if the authenticated API key has the required scope
 */
export function requireScope(requiredScope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res
        .status(401)
        .json(createErrorResponse("Authentication required", 401, req.requestId));
    }

    if (!hasScope(req.apiKey, requiredScope)) {
      log.warn(
        `Insufficient scope for API key ${
          req.apiKey.keyId
        }: required ${requiredScope}, has ${req.apiKey.scopes.join(", ")}`
      );
      return res
        .status(403)
        .json(
          createErrorResponse(
            `Insufficient permissions. Required scope: ${requiredScope}`,
            403,
            req.requestId
          )
        );
    }

    next();
  };
}

/**
 * Log all API requests
 */
export function logRequests(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // Log when response finishes
  res.on("finish", () => {
    const duration = Date.now() - start;
    const keyInfo = req.apiKey ? `${req.apiKey.keyId} (${req.apiKey.name})` : "unauthenticated";

    // Get client IP - check proxy headers if trust proxy is enabled
    let clientIp = req.ip;
    if (envs().API_TRUST_PROXY) {
      clientIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        (req.headers["x-real-ip"] as string) ||
        req.ip;
    }

    log.debug(
      `API ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${keyInfo} - ${clientIp}`
    );
  });

  next();
}

/**
 * Optional API Key authentication middleware - doesn't fail if no auth provided
 */
export async function optionalApiKeyAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    // If no auth header, continue without authentication
    if (!authHeader) {
      return next();
    }

    // Support both "Bearer <key>" and "<key>" formats
    let apiKey: string;
    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else {
      apiKey = authHeader; // Use the header value directly
    }

    const validation = await validateApiKey(apiKey);

    if (validation.isValid) {
      req.apiKey = validation.keyInfo;
      log.debug(
        `API request authenticated: ${validation.keyInfo!.keyId} (${validation.keyInfo!.name})`
      );
    } else {
      log.warn(`Invalid API key attempt from ${req.ip}: ${validation.error}`);
      // Don't fail - just continue without auth
    }

    next();
  } catch (error) {
    log.error("Error in optional API key authentication:", error);
    // Don't fail - just continue without auth
    next();
  }
}
