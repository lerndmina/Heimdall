/**
 * TicketSessionService - Redis-based session management for ticket creation flow
 */

import type { RedisClientType } from "redis";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import { nanoid } from "nanoid";
import { REDIS_KEYS } from "../types/index.js";

/**
 * Ticket session stored in Redis
 */
export interface TicketSession {
  sessionId: string;
  guildId: string;

  // User Context
  userId: string;
  subjectId: string;
  openerId: string;

  // Category Context
  categoryId: string;
  parentCategoryId?: string;

  // Question Flow
  currentStep: number;
  currentQuestionType: "select" | "modal" | "complete";

  // Multi-Modal Support
  currentModalPage?: number;
  totalModalPages?: number;
  modalAnswerBatches?: Record<number, Record<string, string>>;

  // Answers
  selectAnswers: Record<string, string>;
  modalAnswers: Record<string, string>;

  // Metadata
  openReason?: string;
  createdAt: number;
  expiresAt: number;
}

export interface CreateSessionData {
  guildId: string;
  userId: string;
  subjectId: string;
  openerId: string;
  categoryId: string;
  parentCategoryId?: string;
  openReason?: string;
}

export class TicketSessionService {
  private readonly SESSION_TTL = 900; // 15 minutes

  constructor(
    private redis: RedisClientType,
    private logger: PluginLogger,
  ) {}

  private getSessionKey(sessionId: string): string {
    return `${REDIS_KEYS.TICKET_SESSION}${sessionId}`;
  }

  private getUserSessionKey(userId: string): string {
    return `${REDIS_KEYS.TICKET_SESSION}user:${userId}`;
  }

  /**
   * Create a new ticket session
   */
  async createSession(data: CreateSessionData): Promise<string> {
    const sessionId = nanoid(12);
    const now = Date.now();

    const session: TicketSession = {
      sessionId,
      guildId: data.guildId,
      userId: data.userId,
      subjectId: data.subjectId,
      openerId: data.openerId,
      categoryId: data.categoryId,
      parentCategoryId: data.parentCategoryId,
      currentStep: 0,
      currentQuestionType: "select",
      currentModalPage: 0,
      totalModalPages: 0,
      modalAnswerBatches: {},
      selectAnswers: {},
      modalAnswers: {},
      openReason: data.openReason,
      createdAt: now,
      expiresAt: now + this.SESSION_TTL * 1000,
    };

    const key = this.getSessionKey(sessionId);
    const userKey = this.getUserSessionKey(data.userId);

    await this.redis.setEx(key, this.SESSION_TTL, JSON.stringify(session));
    await this.redis.setEx(userKey, this.SESSION_TTL, sessionId);

    this.logger.debug(`Created ticket session ${sessionId} for user ${data.userId}`);
    return sessionId;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<TicketSession | null> {
    const data = await this.redis.get(this.getSessionKey(sessionId));
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get session by user ID
   */
  async getSessionByUser(userId: string): Promise<TicketSession | null> {
    const sessionId = await this.redis.get(this.getUserSessionKey(userId));
    if (!sessionId) return null;
    return this.getSession(sessionId);
  }

  /**
   * Update session
   */
  async updateSession(sessionId: string, updates: Partial<TicketSession>): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const updated = { ...session, ...updates };
    const remainingTTL = Math.max(1, Math.floor((updated.expiresAt - Date.now()) / 1000));

    await this.redis.setEx(this.getSessionKey(sessionId), remainingTTL, JSON.stringify(updated));
    return true;
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      await this.redis.del(this.getSessionKey(sessionId));
      await this.redis.del(this.getUserSessionKey(session.userId));
      this.logger.debug(`Deleted ticket session ${sessionId}`);
    }
  }

  /**
   * Store select question answer
   */
  async setSelectAnswer(sessionId: string, questionId: string, value: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    session.selectAnswers[questionId] = value;
    return this.updateSession(sessionId, { selectAnswers: session.selectAnswers });
  }

  /**
   * Store modal question answer
   */
  async setModalAnswer(sessionId: string, questionId: string, value: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    session.modalAnswers[questionId] = value;
    return this.updateSession(sessionId, { modalAnswers: session.modalAnswers });
  }

  /**
   * Advance to next step
   */
  async advanceStep(sessionId: string): Promise<TicketSession | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    session.currentStep += 1;
    await this.updateSession(sessionId, { currentStep: session.currentStep });
    return session;
  }

  /**
   * Mark session as complete
   */
  async markComplete(sessionId: string): Promise<boolean> {
    return this.updateSession(sessionId, { currentQuestionType: "complete" });
  }

  /**
   * Check if user has active session
   */
  async hasActiveSession(userId: string): Promise<boolean> {
    const sessionId = await this.redis.get(this.getUserSessionKey(userId));
    return sessionId !== null;
  }
}
