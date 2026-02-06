/**
 * GET /api/guilds/:guildId/logging/events
 *
 * Returns static metadata about available logging categories and subcategories.
 *
 * @swagger
 * /api/guilds/{guildId}/logging/events:
 *   get:
 *     summary: Get available logging events
 *     description: Returns all available logging categories and their subcategories
 *     tags: [Logging]
 *     responses:
 *       200:
 *         description: Available logging events
 */

import { Router, type Request, type Response } from "express";

const EVENTS_METADATA = {
  categories: [
    {
      id: "messages",
      name: "Messages",
      description: "Log message edits, deletions, and bulk deletions",
      subcategories: [
        { id: "edits", name: "Edits", description: "Message edits" },
        { id: "deletes", name: "Deletes", description: "Message deletions" },
        { id: "bulk_deletes", name: "Bulk Deletes", description: "Bulk message deletions" },
      ],
    },
    {
      id: "users",
      name: "Users",
      description: "Log user profile and member changes",
      subcategories: [
        { id: "profile_updates", name: "Profile Updates", description: "Username, avatar, banner changes" },
        { id: "member_updates", name: "Member Updates", description: "Nickname, role, and timeout changes" },
      ],
    },
    {
      id: "moderation",
      name: "Moderation",
      description: "Log moderation actions",
      subcategories: [
        { id: "bans", name: "Bans", description: "Member bans" },
        { id: "unbans", name: "Unbans", description: "Member unbans" },
        { id: "timeouts", name: "Timeouts", description: "Member timeouts" },
      ],
    },
  ],
};

export function createEventsRoutes(): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (_req: Request, res: Response) => {
    res.json({ success: true, data: EVENTS_METADATA });
  });

  return router;
}
