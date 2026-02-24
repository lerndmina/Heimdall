import type { PluginAPI, PluginContext, PluginLogger } from "../../src/types/Plugin.js";
import type { HeimdallClient } from "../../src/types/Client.js";
import type { LibAPI } from "../lib/index.js";
import type { ModmailPluginAPI } from "../modmail/index.js";
import { ApplicationService } from "./services/ApplicationService.js";
import { ApplicationSessionService } from "./services/ApplicationSessionService.js";
import { ApplicationReviewService } from "./services/ApplicationReviewService.js";
import { ApplicationFlowService } from "./services/ApplicationFlowService.js";

import "./models/ApplicationForm.js";
import "./models/ApplicationSubmission.js";

export interface ApplicationsPluginAPI extends PluginAPI {
  version: string;
  client: HeimdallClient;
  applicationService: ApplicationService;
  sessionService: ApplicationSessionService;
  reviewService: ApplicationReviewService;
  flowService: ApplicationFlowService;
  modmailApi?: ModmailPluginAPI;
  lib: LibAPI;
}

let pluginAPI: ApplicationsPluginAPI | null = null;

export function getApplicationsAPI(): ApplicationsPluginAPI | null {
  return pluginAPI;
}

export async function onLoad(context: PluginContext): Promise<ApplicationsPluginAPI> {
  const { dependencies, permissionRegistry, redis, client, logger } = context;
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("applications requires lib plugin");

  const modmail = dependencies.get("modmail") as ModmailPluginAPI | undefined;

  const applicationService = new ApplicationService();
  const sessionService = new ApplicationSessionService(redis, logger);
  const reviewService = new ApplicationReviewService(client, applicationService, lib, logger, modmail);
  const flowService = new ApplicationFlowService(client, lib, applicationService, sessionService, reviewService, logger);

  permissionRegistry.registerAction("applications", {
    key: "view",
    label: "View Applications",
    description: "View application forms and submissions in the dashboard.",
  });

  permissionRegistry.registerAction("applications", {
    key: "manage",
    label: "Manage Applications",
    description: "Create and edit application forms and panel posts.",
  });

  permissionRegistry.registerAction("applications", {
    key: "review",
    label: "Review Applications",
    description: "Approve and deny application submissions.",
  });

  lib.componentCallbackService.registerPersistentHandler("applications.apply", async (interaction) => {
    if (!interaction.isButton()) return;
    const metadata = (await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId)) as { formId?: string } | null;
    const formId = metadata?.formId;
    if (!formId) {
      await interaction.reply({ content: "❌ Invalid application panel metadata.", ephemeral: true });
      return;
    }
    await flowService.startFromPanel(interaction, formId);
  });

  lib.componentCallbackService.registerPersistentHandler(
    "applications.review.approve",
    async (interaction) => {
      if (!interaction.isButton()) return;
      const metadata = (await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId)) as { applicationId?: string } | null;
      if (!metadata?.applicationId) {
        await interaction.reply({ content: "❌ Invalid application metadata.", ephemeral: true });
        return;
      }
      await reviewService.handleDecision(interaction, metadata.applicationId, "approved");
    },
    { actionKey: "applications.review", label: "Review Applications", description: "Approve/deny application submissions." },
  );

  lib.componentCallbackService.registerPersistentHandler(
    "applications.review.deny",
    async (interaction) => {
      if (!interaction.isButton()) return;
      const metadata = (await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId)) as { applicationId?: string } | null;
      if (!metadata?.applicationId) {
        await interaction.reply({ content: "❌ Invalid application metadata.", ephemeral: true });
        return;
      }
      await reviewService.handleDecision(interaction, metadata.applicationId, "denied");
    },
    { actionKey: "applications.review", label: "Review Applications", description: "Approve/deny application submissions." },
  );

  lib.componentCallbackService.registerPersistentHandler(
    "applications.review.approve_reason",
    async (interaction) => {
      if (!interaction.isButton()) return;
      const metadata = (await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId)) as { applicationId?: string } | null;
      if (!metadata?.applicationId) {
        await interaction.reply({ content: "❌ Invalid application metadata.", ephemeral: true });
        return;
      }
      await reviewService.handleDecisionWithModal(interaction, metadata.applicationId, "approved");
    },
    { actionKey: "applications.review", label: "Review Applications", description: "Approve/deny application submissions." },
  );

  lib.componentCallbackService.registerPersistentHandler(
    "applications.review.deny_reason",
    async (interaction) => {
      if (!interaction.isButton()) return;
      const metadata = (await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId)) as { applicationId?: string } | null;
      if (!metadata?.applicationId) {
        await interaction.reply({ content: "❌ Invalid application metadata.", ephemeral: true });
        return;
      }
      await reviewService.handleDecisionWithModal(interaction, metadata.applicationId, "denied");
    },
    { actionKey: "applications.review", label: "Review Applications", description: "Approve/deny application submissions." },
  );

  lib.componentCallbackService.registerPersistentHandler(
    "applications.review.modmail",
    async (interaction) => {
      if (!interaction.isButton()) return;
      const metadata = (await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId)) as { applicationId?: string } | null;
      if (!metadata?.applicationId) {
        await interaction.reply({ content: "❌ Invalid application metadata.", ephemeral: true });
        return;
      }
      await reviewService.openLinkedModmail(interaction, metadata.applicationId);
    },
    { actionKey: "applications.review", label: "Review Applications", description: "Approve/deny application submissions." },
  );

  lib.componentCallbackService.registerPersistentHandler("applications.review", async (interaction) => {
    if (!interaction.isButton()) return;
    await interaction.reply({ content: "ℹ️ Legacy review handler is no longer used.", ephemeral: true });
  });

  pluginAPI = {
    version: "1.0.0",
    client,
    applicationService,
    sessionService,
    reviewService,
    flowService,
    modmailApi: modmail,
    lib,
  };

  return pluginAPI;
}

export async function onDisable(_logger: PluginLogger): Promise<void> {
  pluginAPI = null;
}

export const api = "./api";
export const commands = "./commands";
export const events = "./events";
