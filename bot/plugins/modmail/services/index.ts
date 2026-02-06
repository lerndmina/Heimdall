/**
 * Modmail Services - Re-exports all modmail service classes and types
 */

// ModmailService
export { ModmailService, type CreateModmailData, type CloseModmailData, type ModmailConfigOptions, type ModmailCategoryInput, ModmailStatus, MessageType, MessageContext } from "./ModmailService.js";

// ModmailCategoryService
export { ModmailCategoryService, type CreateCategoryData, type UpdateCategoryData } from "./ModmailCategoryService.js";

// ModmailSessionService
export { ModmailSessionService, type ModmailSession, type CreateSessionData } from "./ModmailSessionService.js";

// ModmailCreationService
export { ModmailCreationService, type ModmailCreationResult } from "./ModmailCreationService.js";

// ModmailFlowService
export { ModmailFlowService } from "./ModmailFlowService.js";

// ModmailInteractionService
export { ModmailInteractionService } from "./ModmailInteractionService.js";

// BackgroundModmailService
export { BackgroundModmailService, type BackgroundModmailStats } from "./BackgroundModmailService.js";
