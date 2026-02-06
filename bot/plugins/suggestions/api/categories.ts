/**
 * CRUD /api/guilds/:guildId/suggestions/categories
 *
 * @swagger
 * /api/guilds/{guildId}/suggestions/categories:
 *   get:
 *     summary: List suggestion categories
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of categories
 *   post:
 *     summary: Create a category
 *     tags: [Suggestions]
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
 *             required: [name, description, createdBy]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               emoji:
 *                 type: string
 *               channelId:
 *                 type: string
 *               createdBy:
 *                 type: string
 *     responses:
 *       201:
 *         description: Category created
 * /api/guilds/{guildId}/suggestions/categories/{categoryId}:
 *   put:
 *     summary: Update a category
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category updated
 *   delete:
 *     summary: Delete a category
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category deleted
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SuggestionsApiDependencies } from "./index.js";
import { SuggestionConfigHelper } from "../models/SuggestionConfig.js";

export function createCategoryRoutes(deps: SuggestionsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // List categories
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const categories = await SuggestionConfigHelper.getAllCategories(guildId);
      res.json({ success: true, data: categories });
    } catch (error) {
      next(error);
    }
  });

  // Create category
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { name, description, emoji, channelId, createdBy } = req.body;

      if (!name || !description || !createdBy) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "name, description, and createdBy are required" },
        });
        return;
      }

      const result = await SuggestionConfigHelper.addCategory(guildId, name, description, emoji, channelId, createdBy);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: { code: "CREATION_FAILED", message: result.error },
        });
        return;
      }

      res.status(201).json({ success: true, data: result.category });
    } catch (error) {
      next(error);
    }
  });

  // Update category
  router.put("/:categoryId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;
      const { name, description, emoji, channelId, isActive, updatedBy } = req.body;

      const result = await SuggestionConfigHelper.updateCategory(guildId as string, categoryId as string, { name, description, emoji, channelId, isActive }, updatedBy || "api");

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: { code: "UPDATE_FAILED", message: result.error },
        });
        return;
      }

      res.json({ success: true, data: result.category });
    } catch (error) {
      next(error);
    }
  });

  // Delete category
  router.delete("/:categoryId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;

      const result = await SuggestionConfigHelper.removeCategory(guildId as string, categoryId as string);

      if (!result.success) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: result.error },
        });
        return;
      }

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  // Reorder categories
  router.put("/reorder", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { categoryIds, updatedBy } = req.body;

      if (!categoryIds || !Array.isArray(categoryIds)) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "categoryIds array is required" },
        });
        return;
      }

      const result = await SuggestionConfigHelper.reorderCategories(guildId, categoryIds, updatedBy || "api");

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: { code: "REORDER_FAILED", message: result.error },
        });
        return;
      }

      res.json({ success: true, data: { reordered: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
