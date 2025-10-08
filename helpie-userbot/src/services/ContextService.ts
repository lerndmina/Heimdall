/**
 * ContextService
 *
 * Manages AI context fetching, caching, and resolution.
 * Contexts are stored in MongoDB (GitHub URLs) and cached in Redis (content).
 */

import HelpieContext, { IHelpieContext } from "../models/HelpieContext";
import { redisClient } from "../index";
import log from "../utils/log";

export interface CachedContext {
  content: string;
  characterCount: number;
  wordCount: number;
  fetchedAt: string;
  url: string;
}

export class ContextService {
  /**
   * Validates if a URL is a valid GitHub raw URL (including gists)
   */
  static isValidGitHubRawUrl(url: string): boolean {
    return url.startsWith("https://raw.githubusercontent.com/") || url.startsWith("https://gist.githubusercontent.com/");
  }

  /**
   * Fetches content from GitHub with timeout
   */
  static async fetchGitHubContent(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === "AbortError") {
        throw new Error("GitHub fetch timed out after 10 seconds");
      }
      throw error;
    }
  }

  /**
   * Builds Redis cache key for a context
   */
  static buildCacheKey(scope: "global" | "guild" | "user", targetId?: string): string {
    let key = `helpie:context:${scope}`;
    if (targetId) {
      key += `:${targetId}`;
    }
    return key;
  }

  /**
   * Gets context content from cache or fetches from GitHub
   */
  static async getContextContent(scope: "global" | "guild" | "user", targetId?: string): Promise<string | null> {
    const cacheKey = this.buildCacheKey(scope, targetId);

    try {
      // Try Redis cache first
      if (redisClient.isReady) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const data: CachedContext = JSON.parse(cached);
          log.debug("Context cache hit", { scope, targetId, size: data.characterCount });

          // Update usage stats in background (don't await)
          this.updateContextUsage(scope, targetId).catch((err) => log.error("Failed to update context usage:", err));

          return data.content;
        }
      }

      // Cache miss - fetch from DB and GitHub
      log.debug("Context cache miss, fetching from GitHub", { scope, targetId });
      const context = await this.fetchAndCacheContext(scope, targetId);
      return context?.content || null;
    } catch (error) {
      log.error("Error getting context content:", error);
      return null;
    }
  }

  /**
   * Fetches context from DB, loads from GitHub, and caches in Redis
   */
  static async fetchAndCacheContext(scope: "global" | "guild" | "user", targetId?: string): Promise<{ content: string } | null> {
    try {
      // Build query
      const query: any = { scope };
      if (scope === "user" && targetId) query.targetUserId = targetId;
      if (scope === "guild" && targetId) query.targetGuildId = targetId;

      // Fetch from DB
      const context = await HelpieContext.findOne(query);
      if (!context) {
        log.debug("No context found in database", { scope, targetId });
        return null;
      }

      // Fetch content from GitHub
      log.debug("Fetching context from GitHub", { url: context.githubUrl });
      const content = await this.fetchGitHubContent(context.githubUrl);

      // Calculate stats
      const characterCount = content.length;
      const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

      // Update DB with stats
      await HelpieContext.updateOne(
        { _id: context._id },
        {
          $set: { characterCount, wordCount },
          $inc: { usageCount: 1 },
          $currentDate: { lastUsed: true },
        }
      );

      // Cache in Redis (no expiry)
      if (redisClient.isReady) {
        const cacheKey = this.buildCacheKey(scope, targetId);
        const cacheData: CachedContext = {
          content,
          characterCount,
          wordCount,
          fetchedAt: new Date().toISOString(),
          url: context.githubUrl,
        };

        await redisClient.set(cacheKey, JSON.stringify(cacheData));
        log.debug("Context cached in Redis", { scope, targetId, size: characterCount });
      }

      return { content };
    } catch (error) {
      log.error("Failed to fetch and cache context:", error);
      return null;
    }
  }

  /**
   * Updates context usage statistics
   */
  static async updateContextUsage(scope: "global" | "guild" | "user", targetId?: string): Promise<void> {
    try {
      const query: any = { scope };
      if (scope === "user" && targetId) query.targetUserId = targetId;
      if (scope === "guild" && targetId) query.targetGuildId = targetId;

      await HelpieContext.updateOne(query, {
        $inc: { usageCount: 1 },
        $currentDate: { lastUsed: true },
      });
    } catch (error) {
      log.error("Failed to update context usage:", error);
    }
  }

  /**
   * Resolves relevant context chunks using vector search (NEW METHOD)
   * Returns formatted context string for AI injection with only relevant chunks
   */
  static async resolveRelevantContextForAsk(question: string, userId: string, guildId?: string): Promise<string> {
    try {
      log.info("🔍 Starting vector search for relevant context", { userId, guildId, questionLength: question.length });

      // Import services dynamically to avoid circular dependencies
      const { EmbeddingService } = await import("./EmbeddingService");
      const { VectorSearchService } = await import("./VectorSearchService");

      // 1. Generate embedding for the question
      log.debug("Generating question embedding...");
      const questionEmbedding = await EmbeddingService.embedQuestion(question);
      log.debug(`Question embedding generated: ${questionEmbedding.length} dimensions`);

      // 2. Search for relevant chunks
      log.debug("Searching for relevant chunks...");
      const relevantChunks = await VectorSearchService.searchRelevantChunks(questionEmbedding, userId, guildId);

      if (relevantChunks.length === 0) {
        log.warn("⚠️ No relevant context chunks found - check if contexts are processed and have embeddings");
        return "";
      }

      log.info("✅ Found relevant context chunks", {
        count: relevantChunks.length,
        topScore: relevantChunks[0]?.score,
        scopes: [...new Set(relevantChunks.map((c) => c.scope))],
        contextIds: [...new Set(relevantChunks.map((c) => c.contextId))],
      });

      // 3. Assemble context from chunks
      const assembledContext = await VectorSearchService.assembleContextFromChunks(relevantChunks);

      // 4. Wrap with STRICT system constraints
      return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL: READ-ONLY CONTEXT MODE 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOU ARE A SEARCH ASSISTANT - NOT A CONVERSATIONAL AI

STRICT RULES:
1. ✅ Answer ONLY from the exact context below - copy text directly if possible
2. ❌ If answer is NOT in context → respond EXACTLY: "Unfortunately, I'm not able to help you with this query. Support will be with you soon."
3. ❌ DO NOT ask follow-up questions
4. ❌ DO NOT ask for clarification
5. ❌ DO NOT ask users to "tell me more" or "let me know"
6. ❌ DO NOT provide links unless they are COMPLETE URLs in the context (e.g., https://full-url.com)
7. ❌ DO NOT make up or complete partial URLs
8. ❌ DO NOT use general knowledge or training data
9. ❌ DO NOT mention "documentation", "context", or "information provided"
10. ✅ Be direct and factual - treat context as your ONLY knowledge
11. If the context is insufficient to answer, use the fallback response. If the context is talking about something closely related but not exactly the same, still use the fallback response. For example if a user is asking a question about lunar_garages, this is different from the garages in jobscreator.
12. If you have a choice between providing qbcore or esx, provide the qbcore answer unless otherwise specified by the user.

This is a ONE-SHOT answer system. Give the answer or the fallback message. Nothing else.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 CONTEXT (YOUR ONLY KNOWLEDGE SOURCE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${assembledContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ FINAL WARNING: No follow-ups. No questions. No made-up links. Answer or fallback.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    } catch (error) {
      log.error("Error resolving relevant context:", error);
      // Fall back to empty context on error
      return "";
    }
  }

  /**
   * Clears all context caches in Redis
   */
  static async clearAllCaches(): Promise<number> {
    try {
      if (!redisClient.isReady) {
        throw new Error("Redis client is not ready");
      }

      const keys = await redisClient.keys("helpie:context:*");
      if (keys.length === 0) {
        return 0;
      }

      await redisClient.del(keys);
      log.info("Cleared all context caches", { count: keys.length });
      return keys.length;
    } catch (error) {
      log.error("Failed to clear context caches:", error);
      throw error;
    }
  }

  /**
   * Sets or updates a context
   */
  static async setContext(
    scope: "global" | "guild" | "user",
    githubUrl: string,
    uploadedBy: string,
    options: {
      targetUserId?: string;
      targetGuildId?: string;
      name?: string;
    } = {}
  ): Promise<IHelpieContext> {
    const data: any = {
      scope,
      githubUrl,
      uploadedBy,
      lastModified: new Date(),
    };

    if (options.name) data.name = options.name;
    if (scope === "user" && options.targetUserId) data.targetUserId = options.targetUserId;
    if (scope === "guild" && options.targetGuildId) data.targetGuildId = options.targetGuildId;

    // Build query for upsert
    const query: any = { scope };
    if (scope === "user") query.targetUserId = options.targetUserId;
    if (scope === "guild") query.targetGuildId = options.targetGuildId;

    // Upsert (create or update)
    const context = await HelpieContext.findOneAndUpdate(query, { $set: data }, { upsert: true, new: true });

    // Clear cache for this context
    if (redisClient.isReady) {
      const cacheKey = this.buildCacheKey(scope, scope === "user" ? options.targetUserId : scope === "guild" ? options.targetGuildId : undefined);
      await redisClient.del(cacheKey);
    }

    log.info("Context set", { scope, targetId: options.targetUserId || options.targetGuildId });
    return context!;
  }

  /**
   * Removes a context
   */
  static async removeContext(scope: "global" | "guild" | "user", targetId?: string): Promise<boolean> {
    try {
      const query: any = { scope };
      if (scope === "user" && targetId) query.targetUserId = targetId;
      if (scope === "guild" && targetId) query.targetGuildId = targetId;

      const result = await HelpieContext.deleteOne(query);

      // Clear cache
      if (redisClient.isReady && result.deletedCount > 0) {
        const cacheKey = this.buildCacheKey(scope, targetId);
        await redisClient.del(cacheKey);
      }

      log.info("Context removed", { scope, targetId, deleted: result.deletedCount > 0 });
      return result.deletedCount > 0;
    } catch (error) {
      log.error("Failed to remove context:", error);
      throw error;
    }
  }

  /**
   * Lists all contexts or contexts of a specific scope
   */
  static async listContexts(scope?: "global" | "guild" | "user"): Promise<IHelpieContext[]> {
    const query = scope ? { scope } : {};
    return await HelpieContext.find(query).sort({ scope: 1, uploadedAt: -1 });
  }

  /**
   * Gets a specific context by scope and target
   */
  static async getContext(scope: "global" | "guild" | "user", targetId?: string): Promise<IHelpieContext | null> {
    const query: any = { scope };
    if (scope === "user" && targetId) query.targetUserId = targetId;
    if (scope === "guild" && targetId) query.targetGuildId = targetId;

    return await HelpieContext.findOne(query);
  }

  /**
   * Gets cache status for a context
   */
  static async getCacheStatus(scope: "global" | "guild" | "user", targetId?: string): Promise<boolean> {
    try {
      if (!redisClient.isReady) return false;

      const cacheKey = this.buildCacheKey(scope, targetId);
      const exists = await redisClient.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      return false;
    }
  }
}
