/**
 * ModmailSessionService - Redis-based session management for modmail form wizard
 *
 * Manages ephemeral modmail creation sessions in Redis, supporting multi-modal
 * form workflows where users answer questions across multiple Discord modals.
 */

import type { RedisClientType } from "redis";
import { nanoid } from "nanoid";
import type { PluginLogger } from "../../../src/types/Plugin.js";

/**
 * Modmail session interface (stored in Redis)
 */
export interface ModmailSession {
  sessionId: string;
  guildId: string;

  // User Context
  userId: string;
  userDisplayName: string;

  // Creation Data
  categoryId: string;
  initialMessage: string; // Preview text (for review panel display)

  // Original message reference — used to re-fetch the DM (preserving attachments)
  initialMessageRef?: { channelId: string; messageId: string };

  // Messages the user sent while answering form questions (before thread existed)
  queuedMessageRefs: Array<{ channelId: string; messageId: string }>;

  // Question Flow
  currentStep: number; // Index in formFields array we are processing

  // Multi-Modal Support (Discord modals limited to 5 fields each)
  currentModalPage?: number; // Which modal page (0-indexed) user is on
  totalModalPages?: number; // Total number of modal pages needed
  modalAnswerBatches?: Record<number, Record<string, string>>; // modalPage -> { fieldId -> answer }

  // Answers
  answers: Record<string, string>; // fieldId -> answer (flattened)

  // Metadata
  createdAt: number; // Timestamp
  expiresAt: number; // TTL expiry
}

/**
 * Data required to create a new session
 */
export interface CreateSessionData {
  guildId: string;
  userId: string;
  userDisplayName: string;
  categoryId: string;
  initialMessage: string;
  initialMessageRef?: { channelId: string; messageId: string };
}

/**
 * ModmailSessionService - Ephemeral session management for form wizard
 */
export class ModmailSessionService {
  private readonly SESSION_TTL = 900; // 15 minutes in seconds
  private readonly SESSION_PREFIX = "modmail:session:";
  private readonly USER_SESSION_PREFIX = "modmail:session:user:";

  constructor(
    private redis: RedisClientType,
    private logger: PluginLogger,
  ) {}

  /**
   * Create a new modmail session
   * Returns the session ID
   */
  async createSession(data: CreateSessionData): Promise<string> {
    const sessionId = nanoid(12);
    const now = Date.now();

    const session: ModmailSession = {
      sessionId,
      guildId: data.guildId,
      userId: data.userId,
      userDisplayName: data.userDisplayName,
      categoryId: data.categoryId,
      initialMessage: data.initialMessage,
      initialMessageRef: data.initialMessageRef,
      queuedMessageRefs: [],
      currentStep: 0,
      currentModalPage: 0,
      totalModalPages: 0,
      modalAnswerBatches: {},
      answers: {},
      createdAt: now,
      expiresAt: now + this.SESSION_TTL * 1000,
    };

    const key = this.getSessionKey(sessionId);
    const userKey = this.getUserSessionKey(data.userId);

    try {
      // Store session with TTL
      await this.redis.setEx(key, this.SESSION_TTL, JSON.stringify(session));

      // Track user's active session
      await this.redis.setEx(userKey, this.SESSION_TTL, sessionId);

      this.logger.debug(`Created modmail session ${sessionId} for user ${data.userId}`);
      return sessionId;
    } catch (error) {
      this.logger.error("Failed to create modmail session:", error);
      throw error;
    }
  }

  /**
   * Get a modmail session by ID
   */
  async getSession(sessionId: string): Promise<ModmailSession | null> {
    const key = this.getSessionKey(sessionId);

    try {
      const data = await this.redis.get(key);
      if (!data) {
        return null;
      }

      return JSON.parse(data) as ModmailSession;
    } catch (error) {
      this.logger.error(`Failed to get modmail session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Update a modmail session
   */
  async updateSession(sessionId: string, updates: Partial<ModmailSession>): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    const updated: ModmailSession = {
      ...session,
      ...updates,
    };

    const key = this.getSessionKey(sessionId);

    try {
      // Calculate remaining TTL
      const remainingTTL = Math.max(0, Math.floor((updated.expiresAt - Date.now()) / 1000));

      if (remainingTTL <= 0) {
        this.logger.warn(`Session ${sessionId} has expired`);
        await this.deleteSession(sessionId);
        return false;
      }

      await this.redis.setEx(key, remainingTTL, JSON.stringify(updated));
      return true;
    } catch (error) {
      this.logger.error(`Failed to update modmail session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Delete a modmail session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    const key = this.getSessionKey(sessionId);

    try {
      await this.redis.del(key);

      // Also delete user session tracking
      if (session) {
        const userKey = this.getUserSessionKey(session.userId);
        const userSessionId = await this.redis.get(userKey);

        if (userSessionId === sessionId) {
          await this.redis.del(userKey);
        }
      }

      this.logger.debug(`Deleted modmail session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to delete modmail session ${sessionId}:`, error);
    }
  }

  /**
   * Get user's active session ID (for spam prevention)
   */
  async getUserActiveSession(userId: string): Promise<string | null> {
    const userKey = this.getUserSessionKey(userId);

    try {
      return await this.redis.get(userKey);
    } catch (error) {
      this.logger.error(`Failed to get user session for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Queue a message reference sent by the user while the form wizard is active.
   * These messages will be forwarded to the thread after creation.
   */
  async queueMessage(sessionId: string, ref: { channelId: string; messageId: string }): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    session.queuedMessageRefs.push(ref);

    return this.updateSession(sessionId, {
      queuedMessageRefs: session.queuedMessageRefs,
    });
  }

  /**
   * Record answer to a field
   */
  async recordAnswer(sessionId: string, fieldId: string, answer: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.answers[fieldId] = answer;

    await this.updateSession(sessionId, {
      answers: session.answers,
    });
  }

  // ========================================
  // MULTI-MODAL SUPPORT
  // ========================================

  /**
   * Initialize multi-modal session tracking
   * Call this when starting a form that needs multiple modals
   */
  async initializeModalPages(sessionId: string, totalModalPages: number): Promise<void> {
    await this.updateSession(sessionId, {
      currentModalPage: 0,
      totalModalPages,
      modalAnswerBatches: {},
    });
  }

  /**
   * Record answers for a specific modal page
   */
  async recordModalPageAnswers(sessionId: string, modalPage: number, answers: Record<string, string>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const batches = session.modalAnswerBatches || {};
    batches[modalPage] = answers;

    await this.updateSession(sessionId, {
      modalAnswerBatches: batches,
    });
  }

  /**
   * Advance to next modal page
   * Returns true if there are more pages, false if we've finished
   */
  async advanceModalPage(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const currentPage = session.currentModalPage ?? 0;
    const totalPages = session.totalModalPages ?? 1;
    const nextPage = currentPage + 1;

    await this.updateSession(sessionId, {
      currentModalPage: nextPage,
    });

    return nextPage < totalPages;
  }

  /**
   * Flatten all modal answer batches into the answers field
   * Call this after all modals have been completed
   */
  async flattenModalAnswers(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const batches = session.modalAnswerBatches || {};
    const flattened = { ...session.answers };

    // Flatten all batches into one object
    for (const batchAnswers of Object.values(batches)) {
      Object.assign(flattened, batchAnswers);
    }

    await this.updateSession(sessionId, {
      answers: flattened,
    });
  }

  // ========================================
  // PRIVATE HELPERS
  // ========================================

  /**
   * Get Redis key for session
   */
  private getSessionKey(sessionId: string): string {
    return `${this.SESSION_PREFIX}${sessionId}`;
  }

  /**
   * Get Redis key for user session tracking
   */
  private getUserSessionKey(userId: string): string {
    return `${this.USER_SESSION_PREFIX}${userId}`;
  }
}
