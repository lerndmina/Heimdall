/**
 * Ticket Questions API Routes
 *
 * Handles CRUD operations for category questions (select and modal).
 * These routes are nested under /categories/:categoryId/questions
 *
 * @swagger
 * tags:
 *   - name: Ticket Questions
 *     description: Category question management
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import TicketCategory from "../models/TicketCategory.js";
import { CategoryType, MAX_MODAL_QUESTIONS, MAX_SELECT_QUESTIONS } from "../types/index.js";
import { nanoid } from "nanoid";

export function createQuestionsRoutes(_deps: ApiDependencies): Router {
  const router = Router({ mergeParams: true }); // Access :categoryId from parent

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}/questions:
   *   get:
   *     summary: Get all questions for a category
   *     description: Returns all select and modal questions configured for the category
   *     tags: [Ticket Questions]
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
   *         description: List of questions
   *       404:
   *         description: Category not found
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      const selectQuestions = (category.selectQuestions || []).sort((a, b) => a.order - b.order);

      const modalQuestions = (category.modalQuestions || []).sort((a, b) => a.order - b.order);

      res.json({
        success: true,
        data: {
          categoryId: category.id,
          categoryName: category.name,
          selectQuestions,
          modalQuestions,
          counts: {
            select: selectQuestions.length,
            modal: modalQuestions.length,
            total: selectQuestions.length + modalQuestions.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}/questions/select:
   *   post:
   *     summary: Add a select question
   *     description: Adds a new select menu question to the category
   *     tags: [Ticket Questions]
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
   *             required:
   *               - label
   *               - options
   *             properties:
   *               label:
   *                 type: string
   *               placeholder:
   *                 type: string
   *               required:
   *                 type: boolean
   *                 default: true
   *               options:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     label:
   *                       type: string
   *                     value:
   *                       type: string
   *                     emoji:
   *                       type: string
   *                     description:
   *                       type: string
   *     responses:
   *       201:
   *         description: Question created successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Category not found
   */
  router.post("/select", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;
      const { label, placeholder, options, required = true } = req.body;

      if (!label || !options || options.length === 0) {
        res.status(400).json({
          success: false,
          error: "label and options are required",
        });
        return;
      }

      if (options.length > 16) {
        res.status(400).json({
          success: false,
          error: "Maximum 16 options allowed per select question",
        });
        return;
      }

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      if (category.type !== CategoryType.CHILD) {
        res.status(400).json({
          success: false,
          error: "Only child categories can have questions",
        });
        return;
      }

      if (category.selectQuestions.length >= MAX_SELECT_QUESTIONS) {
        res.status(400).json({
          success: false,
          error: `Maximum ${MAX_SELECT_QUESTIONS} select questions allowed`,
        });
        return;
      }

      const maxOrder = Math.max(0, ...category.selectQuestions.map((q) => q.order));

      const question = {
        id: nanoid(12),
        label,
        placeholder,
        options,
        required,
        order: maxOrder + 1,
      };

      category.selectQuestions.push(question);
      await category.save();

      res.status(201).json({ success: true, data: question });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}/questions/modal:
   *   post:
   *     summary: Add a modal question
   *     description: Adds a new text input question to the category
   *     tags: [Ticket Questions]
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
   *             required:
   *               - label
   *             properties:
   *               label:
   *                 type: string
   *               placeholder:
   *                 type: string
   *               style:
   *                 type: string
   *                 enum: [short, paragraph]
   *                 default: paragraph
   *               required:
   *                 type: boolean
   *                 default: true
   *               minLength:
   *                 type: integer
   *               maxLength:
   *                 type: integer
   *     responses:
   *       201:
   *         description: Question created successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Category not found
   */
  router.post("/modal", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;
      const { label, placeholder, style = "paragraph", required = true, minLength, maxLength } = req.body;

      if (!label) {
        res.status(400).json({ success: false, error: "label is required" });
        return;
      }

      if (!["short", "paragraph"].includes(style)) {
        res.status(400).json({
          success: false,
          error: "style must be 'short' or 'paragraph'",
        });
        return;
      }

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      if (category.type !== CategoryType.CHILD) {
        res.status(400).json({
          success: false,
          error: "Only child categories can have questions",
        });
        return;
      }

      if (category.modalQuestions.length >= MAX_MODAL_QUESTIONS) {
        res.status(400).json({
          success: false,
          error: `Maximum ${MAX_MODAL_QUESTIONS} modal questions allowed`,
        });
        return;
      }

      const maxOrder = Math.max(0, ...category.modalQuestions.map((q) => q.order));

      const question = {
        id: nanoid(12),
        label,
        placeholder,
        style: style as "short" | "paragraph",
        required,
        minLength,
        maxLength,
        order: maxOrder + 1,
      };

      category.modalQuestions.push(question);
      await category.save();

      res.status(201).json({ success: true, data: question });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}/questions/{questionId}:
   *   patch:
   *     summary: Update a question
   *     description: Updates a select or modal question
   *     tags: [Ticket Questions]
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
   *       - in: path
   *         name: questionId
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
   *               label:
   *                 type: string
   *               placeholder:
   *                 type: string
   *               required:
   *                 type: boolean
   *               options:
   *                 type: array
   *               style:
   *                 type: string
   *               minLength:
   *                 type: integer
   *               maxLength:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Question updated successfully
   *       404:
   *         description: Category or question not found
   */
  router.patch("/:questionId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId, questionId } = req.params;
      const updates = req.body;

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      // Check both select and modal questions
      let found = false;
      let updatedQuestion: Record<string, unknown> | undefined;

      const selectIdx = category.selectQuestions.findIndex((q) => q.id === questionId);
      if (selectIdx >= 0) {
        const question = category.selectQuestions[selectIdx]!;
        // Apply allowed updates for select questions
        if (updates.label !== undefined) question.label = updates.label;
        if (updates.placeholder !== undefined) question.placeholder = updates.placeholder;
        if (updates.required !== undefined) question.required = updates.required;
        if (updates.options !== undefined) question.options = updates.options;
        found = true;
        updatedQuestion = question as unknown as Record<string, unknown>;
      }

      const modalIdx = category.modalQuestions.findIndex((q) => q.id === questionId);
      if (modalIdx >= 0) {
        const question = category.modalQuestions[modalIdx]!;
        // Apply allowed updates for modal questions
        if (updates.label !== undefined) question.label = updates.label;
        if (updates.placeholder !== undefined) question.placeholder = updates.placeholder;
        if (updates.required !== undefined) question.required = updates.required;
        if (updates.style !== undefined) question.style = updates.style;
        if (updates.minLength !== undefined) question.minLength = updates.minLength;
        if (updates.maxLength !== undefined) question.maxLength = updates.maxLength;
        found = true;
        updatedQuestion = question as unknown as Record<string, unknown>;
      }

      if (!found) {
        res.status(404).json({ success: false, error: "Question not found" });
        return;
      }

      await category.save();

      res.json({ success: true, data: updatedQuestion, message: "Question updated" });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}/questions/{questionId}:
   *   delete:
   *     summary: Delete a question
   *     description: Removes a select or modal question from the category
   *     tags: [Ticket Questions]
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
   *       - in: path
   *         name: questionId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Question deleted successfully
   *       404:
   *         description: Category or question not found
   */
  router.delete("/:questionId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId, questionId } = req.params;

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      const selectBefore = category.selectQuestions.length;
      const filteredSelect = category.selectQuestions.filter((q) => q.id !== questionId);

      const modalBefore = category.modalQuestions.length;
      const filteredModal = category.modalQuestions.filter((q) => q.id !== questionId);

      if (selectBefore === filteredSelect.length && modalBefore === filteredModal.length) {
        res.status(404).json({ success: false, error: "Question not found" });
        return;
      }

      // Use splice to remove questions properly from DocumentArray
      if (selectBefore !== filteredSelect.length) {
        const toRemoveIdx = category.selectQuestions.findIndex((q) => q.id === questionId);
        if (toRemoveIdx >= 0) {
          category.selectQuestions.splice(toRemoveIdx, 1);
        }
      }
      if (modalBefore !== filteredModal.length) {
        const toRemoveIdx = category.modalQuestions.findIndex((q) => q.id === questionId);
        if (toRemoveIdx >= 0) {
          category.modalQuestions.splice(toRemoveIdx, 1);
        }
      }

      await category.save();

      res.json({ success: true, message: "Question deleted" });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/categories/{categoryId}/questions/reorder:
   *   patch:
   *     summary: Reorder questions
   *     description: Updates the order of select and/or modal questions
   *     tags: [Ticket Questions]
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
   *               selectOrder:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Array of question IDs in desired order
   *               modalOrder:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Array of question IDs in desired order
   *     responses:
   *       200:
   *         description: Questions reordered successfully
   *       404:
   *         description: Category not found
   */
  router.patch("/reorder", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, categoryId } = req.params;
      const { selectOrder, modalOrder } = req.body;

      const category = await TicketCategory.findOne({ id: categoryId, guildId });
      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      // Update select question order
      if (selectOrder && Array.isArray(selectOrder)) {
        for (let i = 0; i < selectOrder.length; i++) {
          const q = category.selectQuestions.find((sq) => sq.id === selectOrder[i]);
          if (q) q.order = i + 1;
        }
      }

      // Update modal question order
      if (modalOrder && Array.isArray(modalOrder)) {
        for (let i = 0; i < modalOrder.length; i++) {
          const q = category.modalQuestions.find((mq) => mq.id === modalOrder[i]);
          if (q) q.order = i + 1;
        }
      }

      await category.save();

      res.json({ success: true, message: "Questions reordered" });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
