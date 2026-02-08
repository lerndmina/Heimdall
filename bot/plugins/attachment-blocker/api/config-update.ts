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

  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { enabled, defaultAllowedTypes, defaultTimeoutDuration } = req.body;

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

      const updates: Record<string, unknown> = {};
      if (typeof enabled === "boolean") updates.enabled = enabled;
      if (defaultAllowedTypes !== undefined) updates.defaultAllowedTypes = defaultAllowedTypes;
      if (defaultTimeoutDuration !== undefined) updates.defaultTimeoutDuration = defaultTimeoutDuration;

      const config = await deps.service.updateGuildConfig(guildId, updates);
      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
