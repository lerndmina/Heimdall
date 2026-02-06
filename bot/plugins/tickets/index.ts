/**
 * Tickets Plugin - Support ticket system
 *
 * Provides the data layer for the ticket system including:
 * - Ticket model for individual tickets
 * - TicketCategory model for category definitions
 * - TicketOpener model for opener message configs
 * - TicketArchiveConfig model for archive settings
 */

import path from "path";
import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";
import type { SupportCoreAPI } from "../support-core/index.js";

// Import API router
import { createTicketsRouter } from "./api/index.js";

// Import services
import { TicketCategoryService } from "./services/TicketCategoryService.js";
import { TicketLifecycleService } from "./services/TicketLifecycleService.js";
import { TicketSessionService, type TicketSession, type CreateSessionData } from "./services/TicketSessionService.js";
import { TicketFlowService } from "./services/TicketFlowService.js";
import { TicketInteractionService } from "./services/TicketInteractionService.js";
import { TicketReminderService, TicketReminderAction } from "./services/TicketReminderService.js";
import { TicketArchiveCleanupService } from "./services/TicketArchiveCleanupService.js";

// Import utilities
import { InteractionFlow } from "./utils/InteractionFlow.js";
import { getTicketFromChannel, hasStaffPermission, canManageTicket } from "./utils/TicketPermissions.js";
import { buildControlPanel } from "./utils/TicketControlPanel.js";
import { buildOpenerMessage } from "./utils/TicketOpenerBuilder.js";
import { createTicketChannel, sendTicketWelcomeMessage, createTicketFromSession } from "./utils/TicketCreator.js";
import { askSelectQuestion, askModalQuestions, handleSelectAnswer, handleModalContinue, handleModalEdit } from "./utils/TicketQuestionHandler.js";

// Import models to ensure they're registered
import Ticket, { type ITicket, type ITicketModel, type TicketTranscript, type QuestionResponse, type ReminderState } from "./models/Ticket.js";
import TicketCategory, {
  type ITicketCategory,
  type ITicketCategoryModel,
  type StaffRole,
  type SelectOption,
  type SelectQuestion,
  type ModalQuestion,
  type InactivityReminderConfig,
} from "./models/TicketCategory.js";
import TicketOpener, { type ITicketOpener, type ITicketOpenerModel } from "./models/TicketOpener.js";
import TicketArchiveConfig, { type ITicketArchiveConfig, type ITicketArchiveConfigModel } from "./models/TicketArchiveConfig.js";

// Import and re-export types/constants
import {
  TicketStatus,
  CategoryType,
  OpenerUIType,
  QuestionStyle,
  ReminderPingBehavior,
  DEFAULT_TICKET_NAME_FORMAT,
  MAX_MODAL_QUESTIONS,
  MAX_SELECT_QUESTIONS,
  MAX_OPENER_CATEGORIES,
  DEFAULT_WARNING_DELAY,
  DEFAULT_CLOSE_DELAY,
  REDIS_KEYS,
} from "./types/index.js";

// Re-export all types for consumers
export type {
  ITicket,
  ITicketModel,
  TicketTranscript,
  QuestionResponse,
  ReminderState,
  ITicketCategory,
  ITicketCategoryModel,
  StaffRole,
  SelectOption,
  SelectQuestion,
  ModalQuestion,
  InactivityReminderConfig,
  ITicketOpener,
  ITicketOpenerModel,
  ITicketArchiveConfig,
  ITicketArchiveConfigModel,
};

// Re-export enums and constants
export {
  TicketStatus,
  CategoryType,
  OpenerUIType,
  QuestionStyle,
  ReminderPingBehavior,
  TicketReminderAction,
  DEFAULT_TICKET_NAME_FORMAT,
  MAX_MODAL_QUESTIONS,
  MAX_SELECT_QUESTIONS,
  MAX_OPENER_CATEGORIES,
  DEFAULT_WARNING_DELAY,
  DEFAULT_CLOSE_DELAY,
  REDIS_KEYS,
};

// Re-export service types
export type { TicketSession, CreateSessionData };

// Re-export QuestionManagementUI
export { QuestionManagementUI } from "./utils/QuestionManagementUI.js";

// Re-export utilities
export { InteractionFlow };

/**
 * API exposed by tickets plugin
 */
export interface TicketsAPI extends PluginAPI {
  version: string;

  // Models (for other plugins if needed)
  models: {
    Ticket: typeof Ticket;
    TicketCategory: typeof TicketCategory;
    TicketOpener: typeof TicketOpener;
    TicketArchiveConfig: typeof TicketArchiveConfig;
  };

  // Core Services
  categoryService: TicketCategoryService;
  lifecycleService: TicketLifecycleService;
  sessionService: TicketSessionService;

  // Flow Services
  flowService: TicketFlowService;
  interactionService: TicketInteractionService;

  // Background Services
  reminderService: TicketReminderService;
  archiveCleanupService: TicketArchiveCleanupService;

  // Enums
  TicketStatus: typeof TicketStatus;
  TicketReminderAction: typeof TicketReminderAction;
  CategoryType: typeof CategoryType;
  OpenerUIType: typeof OpenerUIType;
  QuestionStyle: typeof QuestionStyle;
  ReminderPingBehavior: typeof ReminderPingBehavior;

  // Constants
  DEFAULT_TICKET_NAME_FORMAT: typeof DEFAULT_TICKET_NAME_FORMAT;
  MAX_MODAL_QUESTIONS: typeof MAX_MODAL_QUESTIONS;
  MAX_SELECT_QUESTIONS: typeof MAX_SELECT_QUESTIONS;
  MAX_OPENER_CATEGORIES: typeof MAX_OPENER_CATEGORIES;
  DEFAULT_WARNING_DELAY: typeof DEFAULT_WARNING_DELAY;
  DEFAULT_CLOSE_DELAY: typeof DEFAULT_CLOSE_DELAY;
  REDIS_KEYS: typeof REDIS_KEYS;

  // Utilities
  utils: {
    getTicketFromChannel: typeof getTicketFromChannel;
    hasStaffPermission: typeof hasStaffPermission;
    canManageTicket: typeof canManageTicket;
    buildControlPanel: typeof buildControlPanel;
    buildOpenerMessage: typeof buildOpenerMessage;
    createTicketChannel: typeof createTicketChannel;
    sendTicketWelcomeMessage: typeof sendTicketWelcomeMessage;
    createTicketFromSession: typeof createTicketFromSession;
    askSelectQuestion: typeof askSelectQuestion;
    askModalQuestions: typeof askModalQuestions;
    handleSelectAnswer: typeof handleSelectAnswer;
    handleModalContinue: typeof handleModalContinue;
    handleModalEdit: typeof handleModalEdit;
  };
}

export async function onLoad(context: PluginContext): Promise<TicketsAPI> {
  const { logger, redis, client, dependencies, apiManager, manifest, pluginPath } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI;
  if (!lib) {
    throw new Error("tickets plugin requires lib plugin");
  }

  // Get support-core dependency
  const supportCore = dependencies.get("support-core") as SupportCoreAPI;
  if (!supportCore) {
    throw new Error("tickets plugin requires support-core plugin");
  }

  // Initialize core services (step 7b)
  const categoryService = new TicketCategoryService(logger);
  const lifecycleService = new TicketLifecycleService(client, logger, lib);
  const sessionService = new TicketSessionService(redis, logger);

  // Initialize flow and interaction services (step 7c)
  const flowService = new TicketFlowService(client, logger, lib, sessionService, lifecycleService, categoryService);

  const interactionService = new TicketInteractionService(client, logger, lib, flowService, lifecycleService, sessionService);

  // Register persistent handlers
  await interactionService.registerHandlers();

  // Initialize background services (step 7d)
  const reminderService = new TicketReminderService(client, logger, lib, supportCore);
  const archiveCleanupService = new TicketArchiveCleanupService(client, logger, lib);

  // Start background services
  reminderService.start();
  archiveCleanupService.start();

  // Register API routes
  const router = createTicketsRouter({
    categoryService,
    lifecycleService,
    lib,
  });

  apiManager.registerRouter({
    pluginName: manifest.name,
    prefix: "/tickets",
    router,
    swaggerPaths: [path.join(pluginPath, "api", "*.ts")],
  });

  logger.info("tickets plugin loaded (models + services + handlers + background + API)");

  return {
    version: "1.0.0",

    models: {
      Ticket,
      TicketCategory,
      TicketOpener,
      TicketArchiveConfig,
    },

    // Core Services
    categoryService,
    lifecycleService,
    sessionService,

    // Flow Services
    flowService,
    interactionService,

    // Background Services
    reminderService,
    archiveCleanupService,

    // Enums
    TicketStatus,
    CategoryType,
    TicketReminderAction,
    OpenerUIType,
    QuestionStyle,
    ReminderPingBehavior,

    // Constants
    DEFAULT_TICKET_NAME_FORMAT,
    MAX_MODAL_QUESTIONS,
    MAX_SELECT_QUESTIONS,
    MAX_OPENER_CATEGORIES,
    DEFAULT_WARNING_DELAY,
    DEFAULT_CLOSE_DELAY,
    REDIS_KEYS,

    // Utilities
    utils: {
      getTicketFromChannel,
      hasStaffPermission,
      canManageTicket,
      buildControlPanel,
      buildOpenerMessage,
      createTicketChannel,
      sendTicketWelcomeMessage,
      createTicketFromSession,
      askSelectQuestion,
      askModalQuestions,
      handleSelectAnswer,
      handleModalContinue,
      handleModalEdit,
    },
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("Plugin disabled");
}

// Command and event paths for plugin loader
export const commands = "./commands";
export const events = "./events";
