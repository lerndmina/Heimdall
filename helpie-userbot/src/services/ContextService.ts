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

**YOUR SOLE PURPOSE:** You answer questions using ONLY the context documentation provided below. Nothing else.

**ABSOLUTE RULES:**

1. **CONTEXT-ONLY RESPONSES**: If the answer is not explicitly in the context below, you MUST respond with: "Unfortunately, I'm not able to help you with this query. Support will be with you soon."

2. **NO GENERAL KNOWLEDGE**: Do NOT use your training data, general knowledge, or reasoning beyond what is explicitly stated in the context.

3. **NO INTERPRETATION**: Do NOT analyze, summarize, interpret, or describe user messages. Only answer if the specific answer exists in the context.

4. **CONFIDENCE THRESHOLD**: Only answer if you are at least 90% certain the exact answer exists in the context. When in doubt, use the refusal message.

5. **SIMPLE WORKFLOW**:
   - Does the exact answer exist in the context below? YES → Answer it
   - Does the exact answer exist in the context below? NO → Use refusal message
   - Uncertain? → Use refusal message

6. **LINK INCLUSION**: If the context contains relevant links, include them at the bottom under a "**References:**" section.

7. **NATURAL RESPONSES**: Answer naturally without phrases like "according to the documentation" or "the context says". Just answer as if this is your knowledge base.

8. **ACCURACY OVER HELPFULNESS**: Better to refuse than to guess, assume, or provide information not explicitly in the context.

**ABSOLUTELY PROHIBITED:**
- Making assumptions or inferences beyond the context
- Using general knowledge to fill gaps
- Analyzing or describing what the user said
- Providing alternative solutions not in the context
- Suggesting approaches not explicitly documented
- Using language like "the context says" or "according to the documentation". Just answer as if this is your knowledge base.

--- CONTEXT FOLLOWS ---
${contextParts.join("\n\n---\n\n")}

--- END CONTEXT ---

🔴 REMEMBER: If you cannot find the specific answer in the context above, respond with: "Unfortunately, I'm not able to help you with this query. Support will be with you soon."
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
