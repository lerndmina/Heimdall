/**
 * PUT /api/guilds/:guildId/attachment-blocker/config
 *
 * Update the guild-wide attachment blocker configuration.
 *
 * Body: { enabled?: boolean, defaultAllowedTypes?: string[], defaultTimeoutDuration?: number }
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { AttachmentBlockerApiDependencies } from "./index.js";
import { AttachmentType } from "../utils/attachment-types.js";

export function createConfigUpdateRoutes(deps: AttachmentBlockerApiDependencies): Router {
  const router = Router({ mergeParams: true });

  const MAX_BYPASS_ROLES = 100;
  const SNOWFLAKE_RE = /^\d{16,22}$/;

  const normalizeBypassRoles = (input: unknown): { ok: true; value: string[] } | { ok: false; message: string } => {
    if (!Array.isArray(input)) {
      return { ok: false, message: "bypassRoleIds must be an array of role ID strings" };
    }

    if (input.length > MAX_BYPASS_ROLES) {
      return { ok: false, message: `bypassRoleIds cannot exceed ${MAX_BYPASS_ROLES} roles` };
    }

    const deduped = [...new Set(input)];
    if (!deduped.every((id) => typeof id === "string" && SNOWFLAKE_RE.test(id))) {
      return { ok: false, message: "All bypassRoleIds entries must be valid Discord role IDs" };
    }

    return { ok: true, value: deduped as string[] };
  };

  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { enabled, defaultAllowedTypes, defaultTimeoutDuration, bypassRoleIds } = req.body;

      // Validate allowed types
      if (defaultAllowedTypes !== undefined) {
        if (!Array.isArray(defaultAllowedTypes)) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: "defaultAllowedTypes must be an array" },
          });
          return;
        }
        const validTypes = Object.values(AttachmentType);
        for (const t of defaultAllowedTypes) {
          if (!validTypes.includes(t as AttachmentType)) {
            res.status(400).json({
              success: false,
              error: { code: "INVALID_INPUT", message: `Invalid attachment type: ${t}` },
            });
            return;
          }
        }
      }

      // Validate timeout
      if (defaultTimeoutDuration !== undefined) {
        if (typeof defaultTimeoutDuration !== "number" || defaultTimeoutDuration < 0) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: "defaultTimeoutDuration must be a non-negative number" },
          });
          return;
        }
      }

      let normalizedBypassRoleIds: string[] | undefined;
      if (bypassRoleIds !== undefined) {
        const normalized = normalizeBypassRoles(bypassRoleIds);
        if (!normalized.ok) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: normalized.message },
          });
          return;
        }
        normalizedBypassRoleIds = normalized.value;
      }

      const updates: Record<string, unknown> = {};
      if (typeof enabled === "boolean") updates.enabled = enabled;
      if (defaultAllowedTypes !== undefined) updates.defaultAllowedTypes = defaultAllowedTypes;
      if (defaultTimeoutDuration !== undefined) updates.defaultTimeoutDuration = defaultTimeoutDuration;
      if (normalizedBypassRoleIds !== undefined) updates.bypassRoleIds = normalizedBypassRoleIds;

      const config = await deps.service.updateGuildConfig(guildId, updates);
      res.json({
        success: true,
        data: {
          ...config,
          bypassRoleIds: config.bypassRoleIds ?? [],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
