import { Client, Guild, User, Message, InteractionResponse } from "discord.js";
import { ModmailConfigType, CategoryType } from "../../models/ModmailConfig";

/**
 * Available hook types in the modmail system
 */
export enum HookType {
  BEFORE_CREATION = "beforeCreation",
  BEFORE_CLOSING = "beforeClosing",
}

/**
 * Hook execution priority levels
 */
export enum HookPriority {
  HIGHEST = 1000,
  HIGH = 750,
  NORMAL = 500,
  LOW = 250,
  LOWEST = 100,
}

/**
 * Base context interface that all hook contexts extend
 */
export interface BaseHookContext {
  client: Client<true>;
  user: User;
  guild: Guild;
  originalMessage: Message;
  hookType: HookType;
  requestId: string;
  sharedBotMessage?: Message; // Shared bot message for editing across hooks
}

/**
 * Context passed to beforeCreation hooks
 */
export interface BeforeCreationHookContext extends BaseHookContext {
  hookType: HookType.BEFORE_CREATION;
  messageContent: string;
  availableGuilds: Array<{ guild: Guild; config: ModmailConfigType }>;
  selectedGuildId?: string;
  selectedCategoryId?: string;
  formResponses?: Record<string, any>;
  formMetadata?: Record<string, { label: string; type: string }>;
  priority?: number;
  ticketNumber?: number;
}

/**
 * Context passed to beforeClosing hooks
 */
export interface BeforeClosingHookContext extends BaseHookContext {
  hookType: HookType.BEFORE_CLOSING;
  modmailId: string;
  closingReason?: string;
  closedBy: User;
  forceClose?: boolean;
}

/**
 * Union type for all hook contexts
 */
export type HookContext = BeforeCreationHookContext | BeforeClosingHookContext;

/**
 * Result returned by hook execution
 */
export interface HookResult {
  success: boolean;
  continue: boolean; // Whether to continue to next hook
  data?: Record<string, any>; // Data to pass to next hooks or main process
  error?: string;
  userMessage?: string; // Message to show to user if hook fails
}

/**
 * Hook execution metadata
 */
export interface HookMetadata {
  id: string;
  name: string;
  description: string;
  priority: HookPriority;
  type: HookType;
  enabled: boolean;
  conditions?: Array<(context: HookContext) => boolean>;
}

/**
 * Hook registration configuration
 */
export interface HookRegistration extends HookMetadata {
  execute: (context: HookContext) => Promise<HookResult>;
}
