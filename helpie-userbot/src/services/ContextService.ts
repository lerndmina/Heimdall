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
   * Resolves all applicable contexts for a user/guild combination
   * Returns formatted context string for AI injection
   */
  static async resolveContextForAsk(userId: string, guildId?: string): Promise<string> {
    const contextParts: string[] = [];

    try {
      // 1. Get global context (if exists)
      const globalContext = await this.getContextContent("global");
      if (globalContext) {
        contextParts.push(`## Global Context\n${globalContext}`);
      }

      // 2. Get guild context (if in guild and exists)
      if (guildId) {
        const guildContext = await this.getContextContent("guild", guildId);
        if (guildContext) {
          contextParts.push(`## Guild Context\n${guildContext}`);
        }
      }

      // 3. Get user context (if exists) - HIGHEST PRIORITY
      const userContext = await this.getContextContent("user", userId);
      if (userContext) {
        contextParts.push(`## User Context (Highest Priority)\n${userContext}`);
      }

      // Return empty if no contexts
      if (contextParts.length === 0) {
        return "";
      }

      // Combine with priority information
      return `
--- ADDITIONAL CONTEXT ---
The following context is provided in priority order (Global → Guild → User).
**User context has the highest priority and should be given more weight in your responses.**

**🚨 CRITICAL INSTRUCTIONS - YOU MUST FOLLOW THESE RULES 🚨**

**YOUR ROLE:** You are a helpful support assistant using the documentation provided below to answer questions.

**CORE PRINCIPLES:**

1. **DOCUMENTATION-BASED RESPONSES**: Base all answers on the context documentation below. You may synthesize, combine, and explain information from the documentation to provide complete, helpful answers.

2. **CONFIDENCE THRESHOLD**: Only answer if you are **90% certain or higher** that your response accurately reflects the documentation. If you lack confidence, use the refusal message.

3. **ENCOURAGED ACTIONS**: You SHOULD:
   - Combine information from different sections to provide comprehensive answers
   - Explain procedures, steps, and workflows documented in the context
   - Provide troubleshooting guidance based on documented solutions
   - Clarify concepts and features described in the documentation
   - Draw reasonable conclusions from documented information
   - Structure responses clearly (numbered lists, bullet points, etc.)
   - Offer practical guidance based on documented best practices

4. **BOUNDARIES**: You must NOT:
   - Contradict information in the documentation
   - Invent features, commands, or solutions not mentioned in the context
   - Use external knowledge to answer questions about undocumented topics
   - Make up technical details not covered in the documentation

5. **REFUSAL MESSAGE**: If the question is about something completely outside the documentation's scope, respond with: "Unfortunately, I'm not able to help you with this query. Support will be with you soon."

6. **HELPFUL FORMATTING**: 
   - Use clear formatting (bullet points, numbered steps, etc.)
   - Include relevant links from the context under a "**References:**" section
   - Structure complex answers with headers or sections when appropriate

7. **NATURAL TONE**: Answer conversationally and naturally, as if the documentation is your knowledge base. Avoid meta-phrases like "according to the documentation" or "the context says".

8. **PRACTICAL FOCUS**: Prioritize being helpful and actionable. If the documentation supports an answer, provide it confidently and completely.

--- CONTEXT FOLLOWS ---
${contextParts.join("\n\n---\n\n")}

--- END CONTEXT ---

� TIP: Be helpful and thorough when answering questions covered by the documentation. Only refuse when the topic is clearly outside the documentation's scope.
`;
    } catch (error) {
      log.error("Error resolving context for ask:", error);
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
