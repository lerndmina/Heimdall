import crypto from "crypto";
import Database from "../data/database";
import ApiKey from "../../models/ApiKey";
import log from "../log";

export interface ApiKeyInfo {
  keyId: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  lastUsed: Date | null;
  isActive: boolean;
  expiresAt: Date | null;
}

export interface CreateApiKeyResult {
  success: boolean;
  keyId?: string;
  apiKey?: string; // Only returned once during creation
  error?: string;
}

export interface ApiKeyValidation {
  isValid: boolean;
  keyInfo?: ApiKeyInfo;
  error?: string;
}

/**
 * Generate a secure API key
 */
export function generateApiKey(): { keyId: string; apiKey: string; hashedKey: string } {
  const keyId = crypto.randomBytes(8).toString("hex");
  const apiKey = `hmd_${keyId}_${crypto.randomBytes(24).toString("hex")}`;
  const hashedKey = crypto.createHash("sha256").update(apiKey).digest("hex");

  return { keyId, apiKey, hashedKey };
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Create a new API key
 */
export async function createApiKey(
  name: string,
  scopes: string[],
  createdBy: string,
  expiresAt?: Date
): Promise<CreateApiKeyResult> {
  try {
    const db = new Database();

    // Validate scopes
    const validScopes = ["modmail:read", "modmail:write", "modmail:admin", "full"];
    const invalidScopes = scopes.filter((scope) => !validScopes.includes(scope));

    if (invalidScopes.length > 0) {
      return {
        success: false,
        error: `Invalid scopes: ${invalidScopes.join(", ")}`,
      };
    }

    // Generate API key
    const { keyId, apiKey, hashedKey } = generateApiKey();

    // Create database entry
    const apiKeyDoc = await db.findOneAndUpdate(
      ApiKey,
      { keyId }, // Query by keyId to ensure uniqueness
      {
        keyId,
        hashedKey,
        name,
        scopes,
        createdBy,
        expiresAt: expiresAt || null,
        createdAt: new Date(),
        isActive: true,
      },
      { upsert: true, new: true }
    );

    log.info(`API key created: ${keyId} by ${createdBy} with scopes: ${scopes.join(", ")}`);

    return {
      success: true,
      keyId,
      apiKey, // Only returned here, never stored or returned again
    };
  } catch (error) {
    log.error("Error creating API key:", error);
    return {
      success: false,
      error: "Failed to create API key",
    };
  }
}

/**
 * Validate an API key
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyValidation> {
  try {
    const db = new Database();
    const hashedKey = hashApiKey(apiKey);

    const keyDoc = await db.findOne(ApiKey, {
      hashedKey,
      isActive: true,
    });

    if (!keyDoc) {
      return {
        isValid: false,
        error: "Invalid API key",
      };
    }

    // Check expiration
    if (keyDoc.expiresAt && keyDoc.expiresAt < new Date()) {
      return {
        isValid: false,
        error: "API key has expired",
      };
    }

    // Update last used timestamp
    await db.findOneAndUpdate(ApiKey, { keyId: keyDoc.keyId }, { lastUsed: new Date() });

    return {
      isValid: true,
      keyInfo: {
        keyId: keyDoc.keyId,
        name: keyDoc.name,
        scopes: keyDoc.scopes,
        createdAt: keyDoc.createdAt,
        lastUsed: keyDoc.lastUsed,
        isActive: keyDoc.isActive,
        expiresAt: keyDoc.expiresAt,
      },
    };
  } catch (error) {
    log.error("Error validating API key:", error);
    return {
      isValid: false,
      error: "Failed to validate API key",
    };
  }
}

/**
 * List API keys for a user
 */
export async function listApiKeys(createdBy: string): Promise<ApiKeyInfo[]> {
  try {
    const db = new Database();

    const keys = await db.find(ApiKey, {
      createdBy,
      isActive: true,
    });

    return keys
      ? keys.map((key) => ({
          keyId: key.keyId,
          name: key.name,
          scopes: key.scopes,
          createdAt: key.createdAt,
          lastUsed: key.lastUsed,
          isActive: key.isActive,
          expiresAt: key.expiresAt,
        }))
      : [];
  } catch (error) {
    log.error("Error listing API keys:", error);
    return [];
  }
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string, revokedBy: string): Promise<boolean> {
  try {
    const db = new Database();

    const result = await db.findOneAndUpdate(
      ApiKey,
      { keyId, createdBy: revokedBy, isActive: true },
      { isActive: false }
    );

    if (result) {
      log.info(`API key revoked: ${keyId} by ${revokedBy}`);
      return true;
    }

    return false;
  } catch (error) {
    log.error("Error revoking API key:", error);
    return false;
  }
}

/**
 * Check if user has required scope
 */
export function hasScope(keyInfo: ApiKeyInfo, requiredScope: string): boolean {
  return keyInfo.scopes.includes("full") || keyInfo.scopes.includes(requiredScope);
}
