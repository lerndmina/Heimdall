/**
 * Ticket Openers API Routes
 *
 * Handles CRUD operations for ticket openers.
 *
 * @swagger
 * tags:
 *   - name: Ticket Openers
 *     description: Opener management endpoints
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import TicketOpener from "../models/TicketOpener.js";
import TicketCategory from "../models/TicketCategory.js";
import { OpenerUIType, MAX_OPENER_CATEGORIES } from "../types/index.js";
import { nanoid } from "nanoid";

export function createOpenersRoutes(_deps: ApiDependencies): Router {
  const router = Router({ mergeParams: true });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/openers:
   *   get:
   *     summary: List all openers
   *     description: Returns all ticket opener configurations for the guild
   *     tags: [Ticket Openers]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of openers
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;

      const openers = await TicketOpener.find({ guildId }).sort({ createdAt: -1 });

      res.json({ success: true, data: openers });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/openers:
   *   post:
   *     summary: Create opener
   *     description: Creates a new ticket opener configuration
   *     tags: [Ticket Openers]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - uiType
   *               - embedTitle
   *               - embedDescription
   *               - categoryIds
   *             properties:
   *               name:
   *                 type: string
   *               uiType:
   *                 type: string
   *                 enum: [buttons, dropdown]
   *               embedTitle:
   *                 type: string
   *               embedDescription:
   *                 type: string
   *               embedColor:
   *                 type: integer
   *               embedImage:
   *                 type: string
   *               embedThumbnail:
   *                 type: string
   *               categoryIds:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       201:
   *         description: Opener created successfully
   *       400:
   *         description: Validation error
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { name, uiType, embedTitle, embedDescription, embedColor, embedImage, embedThumbnail, categoryIds = [] } = req.body;
      const createdBy = req.header("X-User-Id");

      if (!createdBy) {
        res.status(401).json({
          success: false,
          error: "X-User-Id header is required",
        });
        return;
      }

      // Validation
      if (!name || !uiType || !embedTitle || !embedDescription) {
        res.status(400).json({
          success: false,
          error: "Missing required fields: name, uiType, embedTitle, embedDescription",
        });
        return;
      }

      if (!["buttons", "dropdown"].includes(uiType)) {
        res.status(400).json({
          success: false,
          error: "uiType must be 'buttons' or 'dropdown'",
        });
        return;
      }

      if (categoryIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "At least one categoryId is required",
        });
        return;
      }

      if (categoryIds.length > MAX_OPENER_CATEGORIES) {
        res.status(400).json({
          success: false,
          error: `Maximum ${MAX_OPENER_CATEGORIES} categories per opener`,
        });
        return;
      }

      // Verify all categories exist
      const categories = await TicketCategory.find({
        id: { $in: categoryIds },
        guildId,
      });

      if (categories.length !== categoryIds.length) {
        res.status(404).json({
          success: false,
          error: "One or more categories not found",
        });
        return;
      }

      const opener = new TicketOpener({
        id: nanoid(12),
        guildId,
        name,
        uiType: uiType === "buttons" ? OpenerUIType.BUTTONS : OpenerUIType.DROPDOWN,
        embedTitle,
        embedDescription,
        embedColor: embedColor || 0x5865f2,
        embedImage,
        embedThumbnail,
        categoryIds,
        createdBy,
      });

      await opener.save();

      res.status(201).json({ success: true, data: opener });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/openers/{openerId}:
   *   get:
   *     summary: Get single opener
   *     description: Returns detailed information about a specific opener
   *     tags: [Ticket Openers]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: openerId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Opener details
   *       404:
   *         description: Opener not found
   */
  router.get("/:openerId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, openerId } = req.params;

      const opener = await TicketOpener.findOne({ id: openerId, guildId });
      if (!opener) {
        res.status(404).json({ success: false, error: "Opener not found" });
        return;
      }

      res.json({ success: true, data: opener });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/openers/{openerId}:
   *   patch:
   *     summary: Update opener
   *     description: Updates opener fields
   *     tags: [Ticket Openers]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: openerId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               embedTitle:
   *                 type: string
   *               embedDescription:
   *                 type: string
   *               embedColor:
   *                 type: integer
   *               embedImage:
   *                 type: string
   *               embedThumbnail:
   *                 type: string
   *               uiType:
   *                 type: string
   *                 enum: [buttons, dropdown]
   *     responses:
   *       200:
   *         description: Opener updated successfully
   *       404:
   *         description: Opener not found
   */
  router.patch("/:openerId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, openerId } = req.params;
      const updates = req.body;

      const opener = await TicketOpener.findOne({ id: openerId, guildId });
      if (!opener) {
        res.status(404).json({ success: false, error: "Opener not found" });
        return;
      }

      // Apply allowed updates
      const allowedFields = ["name", "embedTitle", "embedDescription", "embedColor", "embedImage", "embedThumbnail"];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          (opener as unknown as Record<string, unknown>)[field] = updates[field];
        }
      }

      // Handle uiType separately
      if (updates.uiType !== undefined) {
        if (!["buttons", "dropdown"].includes(updates.uiType)) {
          res.status(400).json({
            success: false,
            error: "uiType must be 'buttons' or 'dropdown'",
          });
          return;
        }
        opener.uiType = updates.uiType === "buttons" ? OpenerUIType.BUTTONS : OpenerUIType.DROPDOWN;
      }

      await opener.save();

      res.json({ success: true, data: opener });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/openers/{openerId}:
   *   delete:
   *     summary: Delete opener
   *     description: Deletes an opener configuration
   *     tags: [Ticket Openers]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: openerId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Opener deleted successfully
   *       404:
   *         description: Opener not found
   */
  router.delete("/:openerId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, openerId } = req.params;

      const opener = await TicketOpener.findOne({ id: openerId, guildId });
      if (!opener) {
        res.status(404).json({ success: false, error: "Opener not found" });
        return;
      }

      await TicketOpener.deleteOne({ id: openerId, guildId });

      res.json({ success: true, message: "Opener deleted" });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/openers/{openerId}/categories:
   *   patch:
   *     summary: Add or remove categories from opener
   *     description: Modifies the categories associated with an opener
   *     tags: [Ticket Openers]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: openerId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               add:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Category IDs to add
   *               remove:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Category IDs to remove
   *     responses:
   *       200:
   *         description: Categories updated successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Opener not found
   */
  router.patch("/:openerId/categories", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, openerId } = req.params;
      const { add, remove } = req.body;

      const opener = await TicketOpener.findOne({ id: openerId, guildId });
      if (!opener) {
        res.status(404).json({ success: false, error: "Opener not found" });
        return;
      }

      // Add categories
      if (add && Array.isArray(add)) {
        // Verify categories exist
        const categories = await TicketCategory.find({
          id: { $in: add },
          guildId,
        });

        for (const cat of categories) {
          if (!opener.categoryIds.includes(cat.id)) {
            opener.categoryIds.push(cat.id);
          }
        }
      }

      // Remove categories
      if (remove && Array.isArray(remove)) {
        opener.categoryIds = opener.categoryIds.filter((id) => !remove.includes(id));
      }

      // Validate limits
      if (opener.categoryIds.length > MAX_OPENER_CATEGORIES) {
        res.status(400).json({
          success: false,
          error: `Maximum ${MAX_OPENER_CATEGORIES} categories per opener`,
        });
        return;
      }

      if (opener.categoryIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "Opener must have at least one category",
        });
        return;
      }

      await opener.save();

      res.json({ success: true, data: opener });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
