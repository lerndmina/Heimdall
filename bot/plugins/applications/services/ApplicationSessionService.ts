import { nanoid } from "nanoid";
import type { RedisClientType } from "redis";
import type { PluginLogger } from "../../../src/types/Plugin.js";

const SESSION_PREFIX = "applications:session:";
const USER_SESSION_PREFIX = "applications:session:user:";

export type ApplicationQuestionType = "short" | "long" | "select_single" | "select_multi" | "button" | "number";

export interface ApplicationAnswer {
  questionId: string;
  questionLabel: string;
  questionType: ApplicationQuestionType;
  value?: string;
  values?: string[];
}

export interface ApplicationSession {
  sessionId: string;
  guildId: string;
  formId: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl?: string;
  currentIndex: number;
  answers: Record<string, ApplicationAnswer>;
  createdAt: number;
  expiresAt: number;
}

export interface CreateApplicationSessionInput {
  guildId: string;
  formId: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl?: string;
}

export class ApplicationSessionService {
  private readonly SESSION_TTL = 1800;

  constructor(
    private readonly redis: RedisClientType,
    private readonly logger: PluginLogger,
  ) {}

  private getSessionKey(sessionId: string): string {
    return `${SESSION_PREFIX}${sessionId}`;
  }

  private getUserSessionKey(guildId: string, formId: string, userId: string): string {
    return `${USER_SESSION_PREFIX}${guildId}:${formId}:${userId}`;
  }

  async createSession(input: CreateApplicationSessionInput): Promise<ApplicationSession> {
    const sessionId = nanoid(16);
    const now = Date.now();
    const session: ApplicationSession = {
      sessionId,
      guildId: input.guildId,
      formId: input.formId,
      userId: input.userId,
      userDisplayName: input.userDisplayName,
      userAvatarUrl: input.userAvatarUrl,
      currentIndex: 0,
      answers: {},
      createdAt: now,
      expiresAt: now + this.SESSION_TTL * 1000,
    };

    await this.redis.setEx(this.getSessionKey(sessionId), this.SESSION_TTL, JSON.stringify(session));
    await this.redis.setEx(this.getUserSessionKey(input.guildId, input.formId, input.userId), this.SESSION_TTL, sessionId);
    return session;
  }

  async getSession(sessionId: string): Promise<ApplicationSession | null> {
    const raw = await this.redis.get(this.getSessionKey(sessionId));
    return raw ? (JSON.parse(raw) as ApplicationSession) : null;
  }

  async getSessionForUser(guildId: string, formId: string, userId: string): Promise<ApplicationSession | null> {
    const sessionId = await this.redis.get(this.getUserSessionKey(guildId, formId, userId));
    if (!sessionId) return null;
    return this.getSession(sessionId);
  }

  async hasActiveSession(guildId: string, formId: string, userId: string): Promise<boolean> {
    const sessionId = await this.redis.get(this.getUserSessionKey(guildId, formId, userId));
    return !!sessionId;
  }

  async updateSession(sessionId: string, updates: Partial<ApplicationSession>): Promise<ApplicationSession | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const updated: ApplicationSession = { ...session, ...updates };
    const ttl = Math.max(1, Math.floor((updated.expiresAt - Date.now()) / 1000));
    await this.redis.setEx(this.getSessionKey(sessionId), ttl, JSON.stringify(updated));
    return updated;
  }

  async setCurrentIndex(sessionId: string, currentIndex: number): Promise<ApplicationSession | null> {
    return this.updateSession(sessionId, { currentIndex });
  }

  async setAnswer(sessionId: string, answer: ApplicationAnswer): Promise<ApplicationSession | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const answers = {
      ...session.answers,
      [answer.questionId]: answer,
    };

    return this.updateSession(sessionId, { answers });
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    await this.redis.del(this.getSessionKey(sessionId));
    await this.redis.del(this.getUserSessionKey(session.guildId, session.formId, session.userId));
    this.logger.debug(`Deleted application session ${sessionId}`);
  }
}
