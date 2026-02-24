import { Router, type NextFunction, type Request, type Response } from "express";
import { ChannelType } from "discord.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ApplicationsPluginAPI } from "../index.js";

export function createRouter(api: ApplicationsPluginAPI): Router {
  const router = Router({ mergeParams: true });

  router.get("/forms", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const forms = await api.applicationService.listForms(guildId);
      res.json({ success: true, data: forms });
    } catch (error) {
      next(error);
    }
  });

  router.post("/forms", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const createdBy = req.header("X-User-Id");
      const { name } = req.body ?? {};

      if (!createdBy) {
        res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" } });
        return;
      }

      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: { code: "INVALID_INPUT", message: "name is required" } });
        return;
      }

      const form = await api.applicationService.createForm({ guildId, name, createdBy });
      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.manage" });
      res.status(201).json({ success: true, data: form });
    } catch (error) {
      next(error);
    }
  });

  router.get("/forms/:formId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const formId = req.params.formId as string;
      const form = await api.applicationService.getForm(guildId, formId);

      if (!form) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Form not found" } });
        return;
      }

      res.json({ success: true, data: form });
    } catch (error) {
      next(error);
    }
  });

  router.put("/forms/:formId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const formId = req.params.formId as string;
      const updates = req.body ?? {};
      const updated = await api.applicationService.updateForm(guildId, formId, updates);

      if (!updated) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Form not found" } });
        return;
      }

      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.manage" });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/forms/:formId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const formId = req.params.formId as string;
      const deletePosts = String(req.query.deletePosts || "false").toLowerCase() === "true";

      if (deletePosts) {
        const existing = await api.applicationService.getForm(guildId, formId);
        if (existing) {
          for (const panel of existing.panels || []) {
            await api.applicationService.deletePostedPanel(guildId, formId, panel.panelId, api.client);
          }
        }
      }

      const deleted = await api.applicationService.deleteForm(guildId, formId);

      if (!deleted) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Form not found" } });
        return;
      }

      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.manage" });
      res.json({ success: true, data: deleted });
    } catch (error) {
      next(error);
    }
  });

  router.post("/forms/:formId/post", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const formId = req.params.formId as string;
      const postedBy = req.header("X-User-Id");
      const channelId = typeof req.body?.channelId === "string" ? req.body.channelId : "";

      if (!postedBy) {
        res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" } });
        return;
      }

      if (!channelId) {
        res.status(400).json({ success: false, error: { code: "INVALID_INPUT", message: "channelId is required" } });
        return;
      }

      const form = await api.applicationService.getForm(guildId, formId);
      if (!form) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Form not found" } });
        return;
      }

      const guild = await api.lib.thingGetter.getGuild(guildId);
      if (!guild) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Guild not found" } });
        return;
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        res.status(400).json({ success: false, error: { code: "INVALID_INPUT", message: "Target channel must be a text or announcement channel" } });
        return;
      }

      const updated = await api.applicationService.postPanel(form as any, channel as any, postedBy, api.lib);
      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.manage" });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.put("/forms/:formId/update-posts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const formId = req.params.formId as string;

      const form = await api.applicationService.getForm(guildId, formId);
      if (!form) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Form not found" } });
        return;
      }

      const result = await api.applicationService.updatePostedPanels(form as any, api.client, api.lib);
      const refreshed = await api.applicationService.getForm(guildId, formId);
      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.manage" });
      res.json({ success: true, data: { form: refreshed, ...result } });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/forms/:formId/posts/:panelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const formId = req.params.formId as string;
      const panelId = req.params.panelId as string;

      const result = await api.applicationService.deletePostedPanel(guildId, formId, panelId, api.client);
      if (!result.form) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Form not found" } });
        return;
      }

      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.manage" });
      res.json({ success: true, data: { removed: result.removed, form: result.form } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/submissions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const formId = typeof req.query.formId === "string" ? req.query.formId : undefined;
      const status = typeof req.query.status === "string" ? (req.query.status as "pending" | "approved" | "denied") : undefined;
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const limitRaw = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
      const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;

      const submissions = await api.applicationService.listSubmissions(guildId, { formId, status, userId, limit });
      res.json({ success: true, data: submissions });
    } catch (error) {
      next(error);
    }
  });

  router.get("/submissions/:applicationId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const applicationId = req.params.applicationId as string;
      const submission = await api.applicationService.getSubmission(guildId, applicationId);

      if (!submission) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Application not found" } });
        return;
      }

      res.json({ success: true, data: submission });
    } catch (error) {
      next(error);
    }
  });

  router.put("/submissions/:applicationId/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const applicationId = req.params.applicationId as string;
      const reviewedBy = req.header("X-User-Id");
      const { status, reason } = req.body ?? {};

      if (!reviewedBy) {
        res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" } });
        return;
      }

      if (status !== "approved" && status !== "denied") {
        res.status(400).json({ success: false, error: { code: "INVALID_INPUT", message: "status must be approved or denied" } });
        return;
      }

      const result = await api.reviewService.handleDecisionFromApi(guildId, applicationId, status, reviewedBy, typeof reason === "string" ? reason : undefined);

      if (!result.success) {
        res.status(400).json({ success: false, error: { code: "REVIEW_FAILED", message: result.error || "Review failed" } });
        return;
      }

      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.review" });
      res.json({ success: true, data: result.data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/submissions/:applicationId/open-modmail", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const applicationId = req.params.applicationId as string;
      const submission = await api.applicationService.getSubmission(guildId, applicationId);

      if (!submission) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Application not found" } });
        return;
      }

      if (submission.linkedModmailId) {
        res.json({ success: true, data: submission });
        return;
      }

      const form = await api.applicationService.getForm(guildId, submission.formId);
      if (!form) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Form not found" } });
        return;
      }

      const modmail = api.modmailApi;
      if (!modmail) {
        res.status(400).json({ success: false, error: { code: "MODMAIL_UNAVAILABLE", message: "Modmail plugin is not loaded" } });
        return;
      }

      const result = await modmail.creationService.createModmail({
        guildId,
        userId: submission.userId,
        userDisplayName: submission.userDisplayName,
        initialMessage: `This modmail was opened from Application #${submission.applicationNumber} (${submission.formName}).`,
        categoryId: form.modmailCategoryId || undefined,
        formResponses: submission.responses.map((entry: any) => ({
          fieldId: entry.questionId,
          fieldLabel: entry.questionLabel,
          fieldType: entry.questionType === "long" ? "paragraph" : entry.questionType === "number" ? "number" : entry.questionType === "short" ? "short" : "select",
          value: entry.values && entry.values.length > 0 ? entry.values.join(", ") : entry.value || "",
        })),
        createdVia: "api",
      });

      if (!result.success || !result.modmailId) {
        res.status(400).json({ success: false, error: { code: "MODMAIL_FAILED", message: result.userMessage || result.error || "Could not create modmail" } });
        return;
      }

      const updated = await api.applicationService.setLinkedModmailId(guildId, applicationId, result.modmailId);
      if (updated) await api.reviewService.updateSubmissionMessage(guildId, applicationId);
      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.review" });
      res.json({ success: true, data: { submission: updated, modmail: result } });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/submissions/:applicationId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const applicationId = req.params.applicationId as string;
      const deleted = await api.applicationService.deleteSubmission(guildId, applicationId);

      if (!deleted) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Application not found" } });
        return;
      }

      broadcastDashboardChange(guildId, "applications", "updated", { requiredAction: "applications.manage" });
      res.json({ success: true, data: deleted });
    } catch (error) {
      next(error);
    }
  });

  router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const all = await api.applicationService.listSubmissions(guildId, { limit: 500 });
      const stats = {
        total: all.length,
        pending: all.filter((entry) => entry.status === "pending").length,
        approved: all.filter((entry) => entry.status === "approved").length,
        denied: all.filter((entry) => entry.status === "denied").length,
      };
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
