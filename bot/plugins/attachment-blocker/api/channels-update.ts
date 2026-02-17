/**
 * PUT /api/guilds/:guildId/attachment-blocker/channels/:channelId
 *
 * Create or update a per-channel attachment blocker override.
 *
 * Body: { allowedTypes?: string[], timeoutDuration?: number | null, enabled?: boolean }
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { AttachmentBlockerApiDependencies } from "./index.js";
import { AttachmentType } from "../utils/attachment-types.js";

export function createChannelsUpdateRoutes(deps: AttachmentBlockerApiDependencies): Router {
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

  router.put("/:channelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const channelId = req.params.channelId as string;
      const { allowedTypes, timeoutDuration, enabled, bypassRoleIds } = req.body;

      // Validate allowed types
      if (allowedTypes !== undefined) {
        if (!Array.isArray(allowedTypes)) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: "allowedTypes must be an array" },
          });
          return;
        }
        const validTypes = Object.values(AttachmentType);
        for (const t of allowedTypes) {
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
      if (timeoutDuration !== undefined && timeoutDuration !== null) {
        if (typeof timeoutDuration !== "number" || timeoutDuration < 0) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: "timeoutDuration must be a non-negative number or null" },
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

      const config = await deps.service.upsertChannelConfig(guildId, channelId, {
        allowedTypes: allowedTypes as AttachmentType[] | undefined,
        timeoutDuration: timeoutDuration as number | null | undefined,
        bypassRoleIds: normalizedBypassRoleIds,
        enabled: typeof enabled === "boolean" ? enabled : undefined,
        createdBy: "dashboard",
      });

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
