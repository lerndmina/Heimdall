/**
 * Ticket Categories API Routes
 *
 * Handles CRUD operations for ticket categories.
 *
 * @swagger
 * tags:
 *   - name: Ticket Categories
 *     description: Category management endpoints
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import TicketCategory from "../models/TicketCategory.js";
import { CategoryType } from "../types/index.js";
import { nanoid } from "nanoid";
import { createQuestionsRoutes } from "./questions";

export function createCategoriesRoutes(deps: ApiDependencies): Router {
  const { categoryService } = deps;
  const router = Router({ mergeParams: true });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories:
   *   get:
   *     summary: List all categories
   *     description: Returns all ticket categories for the guild
   *     tags: [Ticket Categories]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [parent, child]
   *       - in: query
   *         name: isActive
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: List of categories
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { type, isActive } = req.query;

      const query: Record<string, unknown> = { guildId };
      if (type) query.type = type;
      if (isActive !== undefined) query.isActive = isActive === "true";

      const categories = await TicketCategory.find(query).sort({ createdAt: -1 });

      res.json({ success: true, data: categories });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories:
   *   post:
   *     summary: Create category
   *     description: Creates a new parent or child ticket category
   *     tags: [Ticket Categories]
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
   *               - description
   *               - type
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               emoji:
   *                 type: string
   *               type:
   *                 type: string
   *                 enum: [parent, child]
   *               parentId:
   *                 type: string
   *               discordCategoryId:
   *                 type: string
   *               staffRoles:
   *                 type: array
   *                 items:
   *                   type: object
   *               ticketNameFormat:
   *                 type: string
   *     responses:
   *       201:
   *         description: Category created successfully
   *       400:
   *         description: Validation error
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { name, description, emoji, type, parentId, discordCategoryId, staffRoles, ticketNameFormat, inactivityReminder } = req.body;
      const createdBy = req.header("X-User-Id") || req.body?.createdBy || "api";

      // Validation
      if (!name || !description || !type) {
        res.status(400).json({
          success: false,
          error: "Missing required fields: name, description, type",
        });
        return;
      }

      if (!["parent", "child"].includes(type)) {
        res.status(400).json({
          success: false,
          error: "type must be 'parent' or 'child'",
        });
        return;
      }

      if (type === "child" && !discordCategoryId) {
        res.status(400).json({
          success: false,
          error: "Child categories require discordCategoryId",
        });
        return;
      }

      // Verify parent exists if specified
      if (parentId) {
        const parent = await TicketCategory.findOne({
          id: parentId,
          guildId,
          type: CategoryType.PARENT,
        });
        if (!parent) {
          res.status(404).json({ success: false, error: "Parent category not found" });
          return;
        }
      }

      const categoryId = nanoid(12);

      const category = await categoryService.createCategory(guildId as string, {
        id: categoryId,
        name,
        description,
        emoji,
        type: type === "parent" ? CategoryType.PARENT : CategoryType.CHILD,
        parentId,
        discordCategoryId: type === "child" ? discordCategoryId : undefined,
        staffRoles: staffRoles || [],
        ticketNameFormat: ticketNameFormat || "{number}-{openerusername}-{claimant}",
        // selectQuestions and modalQuestions use schema defaults
        inactivityReminder,
        isActive: true,
        createdBy,
      });

      if (!category) {
        res.status(500).json({ success: false, error: "Failed to create category" });
        return;
      }

      // Add to parent's childIds if this is a child
      if (parentId) {
        await TicketCategory.updateOne({ id: parentId }, { $addToSet: { childIds: categoryId } });
      }

      res.status(201).json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}:
   *   get:
   *     summary: Get single category
   *     description: Returns detailed information about a specific category
   *     tags: [Ticket Categories]
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
   *         description: Category details
   *       404:
   *         description: Category not found
   */
  router.get("/:categoryId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}:
   *   patch:
   *     summary: Update category
   *     description: Updates category fields (discordCategoryId is immutable)
   *     tags: [Ticket Categories]
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
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               emoji:
   *                 type: string
   *               staffRoles:
   *                 type: array
   *               ticketNameFormat:
   *                 type: string
   *               isActive:
   *                 type: boolean
   *               inactivityReminder:
   *                 type: object
   *     responses:
   *       200:
   *         description: Category updated successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Category not found
   */
  router.patch("/:categoryId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;
      const updates = req.body;

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      // Prevent changing immutable fields
      if (updates.discordCategoryId !== undefined && updates.discordCategoryId !== category.discordCategoryId) {
        res.status(400).json({
          success: false,
          error: "discordCategoryId is immutable and cannot be changed",
        });
        return;
      }

      // Validate inactivityReminder if provided
      if (updates.inactivityReminder !== undefined) {
        const ir = updates.inactivityReminder;
        if (ir.warningDelay !== undefined && ir.warningDelay < 60000) {
          res.status(400).json({
            success: false,
            error: "warningDelay must be at least 60000ms (1 minute)",
          });
          return;
        }
        if (ir.closeDelay !== undefined && ir.closeDelay < 60000) {
          res.status(400).json({
            success: false,
            error: "closeDelay must be at least 60000ms (1 minute)",
          });
          return;
        }
      }

      const success = await categoryService.updateCategory(categoryId as string, updates);

      if (success) {
        const updated = await TicketCategory.findOne({ id: categoryId });
        res.json({ success: true, data: updated });
      } else {
        res.status(400).json({ success: false, error: "Update failed" });
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}:
   *   delete:
   *     summary: Delete category
   *     description: Deletes a category (cannot delete if has active tickets or children)
   *     tags: [Ticket Categories]
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
   *         description: Category deleted successfully
   *       400:
   *         description: Cannot delete (has active tickets or children)
   *       404:
   *         description: Category not found
   */
  router.delete("/:categoryId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      // Check if parent has children
      if (category.type === CategoryType.PARENT && category.childIds && category.childIds.length > 0) {
        res.status(400).json({
          success: false,
          error: "Cannot delete parent category with children. Delete children first.",
        });
        return;
      }

      const result = await categoryService.deleteCategory(categoryId as string);

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (error) {
      next(error);
    }
  });

  // Mount questions routes under categories/:categoryId/questions
  router.use("/:categoryId/questions", createQuestionsRoutes(deps));

  return router;
}
