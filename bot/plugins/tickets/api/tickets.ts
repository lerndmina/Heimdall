/**
 * Tickets API Routes
 *
 * Handles viewing and managing active tickets.
 *
 * @swagger
 * tags:
 *   - name: Tickets
 *     description: Ticket management endpoints
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import Ticket from "../models/Ticket.js";
import { TicketStatus } from "../types/index.js";

export function createTicketsRoutes(deps: ApiDependencies): Router {
  const router = Router({ mergeParams: true });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets:
   *   get:
   *     summary: List tickets
   *     description: Returns tickets with optional filters
   *     tags: [Tickets]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [open, claimed, closed, archived]
   *       - in: query
   *         name: categoryId
   *         schema:
   *           type: string
   *       - in: query
   *         name: userId
   *         schema:
   *           type: string
   *       - in: query
   *         name: claimedBy
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: List of tickets
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { status, categoryId, userId, claimedBy, limit = "100", offset = "0" } = req.query;

      const query: Record<string, unknown> = { guildId };
      if (status) query.status = status;
      if (categoryId) query.categoryId = categoryId;
      if (userId) query.userId = userId;
      if (claimedBy) query.claimedBy = claimedBy;

      const tickets = await Ticket.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.min(parseInt(limit as string, 10), 100))
        .skip(parseInt(offset as string, 10));

      const total = await Ticket.countDocuments(query);

      res.json({
        success: true,
        data: tickets,
        pagination: {
          total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/stats:
   *   get:
   *     summary: Get ticket statistics
   *     description: Returns count of tickets by status
   *     tags: [Tickets]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Ticket statistics
   */
  router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;

      const [total, open, claimed, closed, archived] = await Promise.all([
        Ticket.countDocuments({ guildId }),
        Ticket.countDocuments({ guildId, status: TicketStatus.OPEN }),
        Ticket.countDocuments({ guildId, status: TicketStatus.CLAIMED }),
        Ticket.countDocuments({ guildId, status: TicketStatus.CLOSED }),
        Ticket.countDocuments({ guildId, status: TicketStatus.ARCHIVED }),
      ]);

      res.json({
        success: true,
        data: { total, open, claimed, closed, archived },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/{ticketId}:
   *   get:
   *     summary: Get single ticket
   *     description: Returns detailed information about a specific ticket
   *     tags: [Tickets]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: ticketId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Ticket details
   *       404:
   *         description: Ticket not found
   */
  router.get("/:ticketId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, ticketId } = req.params;

      const ticket = await Ticket.findOne({ id: ticketId, guildId });
      if (!ticket) {
        res.status(404).json({ success: false, error: "Ticket not found" });
        return;
      }

      res.json({ success: true, data: ticket });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/{ticketId}/claim:
   *   patch:
   *     summary: Claim a ticket
   *     description: Claims the ticket for a staff member
   *     tags: [Tickets]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: ticketId
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
   *               - staffId
   *             properties:
   *               staffId:
   *                 type: string
   *                 description: Discord user ID of staff member
   *     responses:
   *       200:
   *         description: Ticket claimed successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Ticket not found
   */
  router.patch("/:ticketId/claim", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, ticketId } = req.params;
      const staffId = req.header("X-User-Id");

      if (!staffId) {
        res.status(401).json({ success: false, error: "X-User-Id header is required" });
        return;
      }

      const ticket = await Ticket.findOne({ id: ticketId, guildId });
      if (!ticket) {
        res.status(404).json({ success: false, error: "Ticket not found" });
        return;
      }

      if (ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.ARCHIVED) {
        res.status(400).json({ success: false, error: "Cannot claim a closed ticket" });
        return;
      }

      if (ticket.claimedBy) {
        res.status(400).json({ success: false, error: "Ticket is already claimed" });
        return;
      }

      await Ticket.updateOne(
        { id: ticketId },
        {
          claimedBy: staffId,
          claimedAt: new Date(),
          status: TicketStatus.CLAIMED,
        },
      );

      const updated = await Ticket.findOne({ id: ticketId });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/{ticketId}/unclaim:
   *   patch:
   *     summary: Unclaim a ticket
   *     description: Removes the claim from a ticket
   *     tags: [Tickets]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: ticketId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Ticket unclaimed successfully
   *       400:
   *         description: Ticket is not claimed
   *       404:
   *         description: Ticket not found
   */
  router.patch("/:ticketId/unclaim", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, ticketId } = req.params;

      const ticket = await Ticket.findOne({ id: ticketId, guildId });
      if (!ticket) {
        res.status(404).json({ success: false, error: "Ticket not found" });
        return;
      }

      if (!ticket.claimedBy) {
        res.status(400).json({ success: false, error: "Ticket is not claimed" });
        return;
      }

      await Ticket.updateOne(
        { id: ticketId },
        {
          $unset: { claimedBy: "", claimedAt: "" },
          status: TicketStatus.OPEN,
        },
      );

      const updated = await Ticket.findOne({ id: ticketId });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/{ticketId}/close:
   *   patch:
   *     summary: Close a ticket
   *     description: Closes a ticket (Discord channel management done via bot)
   *     tags: [Tickets]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: ticketId
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
   *               - closedBy
   *             properties:
   *               closedBy:
   *                 type: string
   *                 description: Discord user ID who closed the ticket
   *               reason:
   *                 type: string
   *                 description: Optional reason for closing
   *     responses:
   *       200:
   *         description: Ticket closed successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Ticket not found
   */
  router.patch("/:ticketId/close", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, ticketId } = req.params;
      const closedBy = req.header("X-User-Id");
      const { reason } = req.body || {};

      if (!closedBy) {
        res.status(401).json({ success: false, error: "X-User-Id header is required" });
        return;
      }

      const ticket = await Ticket.findOne({ id: ticketId, guildId });
      if (!ticket) {
        res.status(404).json({ success: false, error: "Ticket not found" });
        return;
      }

      if (ticket.status === TicketStatus.ARCHIVED) {
        res.status(400).json({ success: false, error: "Ticket is already archived" });
        return;
      }

      if (ticket.status === TicketStatus.CLOSED) {
        res.status(400).json({ success: false, error: "Ticket is already closed" });
        return;
      }

      const updates: Record<string, unknown> = {
        status: TicketStatus.CLOSED,
        closedBy,
        closedAt: new Date(),
      };

      if (reason) {
        updates.openReason = reason;
      }

      await Ticket.updateOne({ id: ticketId }, updates);

      const updated = await Ticket.findOne({ id: ticketId });

      res.json({
        success: true,
        data: updated,
        message: "Ticket closed. Discord channel management should be done via bot commands.",
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
