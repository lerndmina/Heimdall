import GuildAIContext, { IGuildAIContext } from "../models/GuildAIContext";
import Database from "../utils/data/database";
import log from "../utils/log";
import { redisClient } from "../Bot";
import { Client } from "discord.js";
import fs from "fs/promises";
import path from "path";

export interface ContextDecision {
  useBotContext: boolean;
  useCustomContext: boolean;
  selectedSources: ("bot" | "custom")[];
}

export class ContextService {
  private db: Database;
  private static botContext: string | null = null;

  constructor() {
    this.db = new Database();
  }

  /**
   * Load static bot context from file
   */
  private async loadBotContext(): Promise<string> {
    if (ContextService.botContext) {
      return ContextService.botContext;
    }

    try {
      const contextPath = path.join(__dirname, "../context/bot-context.md");
      ContextService.botContext = await fs.readFile(contextPath, "utf-8");
      return ContextService.botContext;
    } catch (error) {
      log.error("Failed to load bot context:", error);
      return "";
    }
  }

  /**
   * Replace template variables in context
   */
  private replaceTemplateVariables(content: string, variables: Record<string, string>): string {
    let result = content;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, "g"), value);
    }

    return result;
  }

  /**
   * Store guild context in database
   */
  async storeGuildContext(
    guildId: string,
    content: string,
    userId: string,
    filename?: string,
    settings?: {
      useBotContext?: boolean;
      useCustomContext?: boolean;
      priority?: "bot" | "custom" | "both";
    }
  ): Promise<{ success: boolean; error?: string; context?: IGuildAIContext }> {
    try {
      if (content.length > 50000) {
        return { success: false, error: "Content exceeds 50KB limit" };
      }

      const contextData = {
        guildId,
        content,
        enabled: true,
        uploadedBy: {
          userId,
          uploadedAt: new Date(),
        },
        metadata: {
          characterCount: content.length,
          wordCount: content.split(/\s+/).filter((word) => word.length > 0).length,
          filename,
        },
        settings: {
          useBotContext: settings?.useBotContext ?? true,
          useCustomContext: settings?.useCustomContext ?? true,
          priority: settings?.priority ?? "both",
        },
      };

      const result = await this.db.findOneAndUpdate(
        GuildAIContext,
        { guildId },
        { $set: contextData },
        { upsert: true, new: true }
      );

      if (!result) {
        return { success: false, error: "Failed to store context" };
      }

      // Clear cache
      await this.clearContextCache(guildId);

      log.info(`Stored AI context for guild ${guildId}`, {
        characterCount: content.length,
        wordCount: contextData.metadata.wordCount,
        filename,
      });

      return { success: true, context: result };
    } catch (error) {
      log.error("Error storing guild context:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Get guild context from cache or database
   */
  async getGuildContext(guildId: string): Promise<IGuildAIContext | null> {
    try {
      // Try cache first
      if (redisClient?.isReady) {
        const cacheKey = `guild_ai_context:${guildId}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Get from database
      const context = await this.db.findOne(GuildAIContext, { guildId });

      // Cache the result
      if (context && redisClient?.isReady) {
        const cacheKey = `guild_ai_context:${guildId}`;
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(context)); // 1 hour TTL
      }

      return context;
    } catch (error) {
      log.error("Error getting guild context:", error);
      return null;
    }
  }

  /**
   * Delete guild context
   */
  async deleteGuildContext(guildId: string): Promise<boolean> {
    try {
      await this.db.deleteOne(GuildAIContext, { guildId });
      await this.clearContextCache(guildId);

      log.info(`Deleted AI context for guild ${guildId}`);
      return true;
    } catch (error) {
      log.error("Error deleting guild context:", error);
      return false;
    }
  }

  /**
   * Update guild settings for AI context
   */
  async updateGuildSettings(
    guildId: string,
    settings: Partial<IGuildAIContext["settings"]>
  ): Promise<boolean> {
    try {
      // Prepare the settings object with defaults and overrides
      const finalSettings = {
        useBotContext: settings.useBotContext ?? true,
        useCustomContext: settings.useCustomContext ?? false,
        priority: settings.priority ?? ("bot" as const),
      };

      const updateData: any = {
        $set: {
          lastUpdated: new Date(),
          "settings.useBotContext": finalSettings.useBotContext,
          "settings.useCustomContext": finalSettings.useCustomContext,
          "settings.priority": finalSettings.priority,
        },
        $setOnInsert: {
          guildId,
          content: "", // Empty content since we're just tracking settings
          enabled: true,
          uploadedBy: {
            userId: "system", // System-created for settings-only record
            uploadedAt: new Date(),
          },
          metadata: {
            characterCount: 0,
            wordCount: 0,
          },
        },
      };

      const result = await this.db.findOneAndUpdate(GuildAIContext, { guildId }, updateData, {
        upsert: true,
        new: true,
      });

      if (result) {
        // Clear cache
        await this.clearContextCache(guildId);
        return true;
      }
      return false;
    } catch (error) {
      log.error("Failed to update guild AI context settings:", error);
      return false;
    }
  }

  /**
   * Determine which contexts to use based on query and guild settings
   */
  async determineContextUsage(query: string, guildId: string): Promise<ContextDecision> {
    const guildContext = await this.getGuildContext(guildId);

    // Default to bot context only if no guild context exists
    if (!guildContext || !guildContext.enabled) {
      return {
        useBotContext: true,
        useCustomContext: false,
        selectedSources: ["bot"],
      };
    }

    const { settings } = guildContext;

    // Apply guild preferences
    const decision: ContextDecision = {
      useBotContext: settings.useBotContext,
      useCustomContext: settings.useCustomContext,
      selectedSources: [],
    };

    // Determine sources based on priority and settings
    if (settings.priority === "bot" && settings.useBotContext) {
      decision.selectedSources = ["bot"];
      if (settings.useCustomContext) decision.selectedSources.push("custom");
    } else if (settings.priority === "custom" && settings.useCustomContext) {
      decision.selectedSources = ["custom"];
      if (settings.useBotContext) decision.selectedSources.push("bot");
    } else if (settings.priority === "both") {
      if (settings.useBotContext) decision.selectedSources.push("bot");
      if (settings.useCustomContext) decision.selectedSources.push("custom");
    }

    // Ensure at least one source is selected
    if (decision.selectedSources.length === 0) {
      decision.useBotContext = true;
      decision.selectedSources = ["bot"];
    }

    return decision;
  }

  /**
   * Get combined context for AI prompt
   */
  async getContextForAI(guildId: string, query: string, client?: Client): Promise<string> {
    const decision = await this.determineContextUsage(query, guildId);
    let combinedContext = "";

    // Prepare template variables
    const now = new Date();
    const templateVariables: Record<string, string> = {
      BOT_NAME: client?.user?.username || "Bot",
      BOT_ID: client?.user?.id || "",
      BOT_MENTION: client?.user ? `<@${client.user.id}>` : "@Bot",
      CURRENT_YEAR: now.getFullYear().toString(),
      CURRENT_DATE: now.toLocaleDateString(),
      CURRENT_TIME: now.toLocaleTimeString(),
    };

    // Add guild-specific variables if we can get the guild
    if (client) {
      try {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          templateVariables.GUILD_NAME = guild.name;
          templateVariables.GUILD_ID = guild.id;
          templateVariables.MEMBER_COUNT = guild.memberCount?.toString() || "Unknown";
        }
      } catch (error) {
        // Silently continue if we can't get guild info
      }
    }

    if (decision.useBotContext) {
      const rawBotContext = await this.loadBotContext();
      if (rawBotContext) {
        const processedBotContext = this.replaceTemplateVariables(rawBotContext, templateVariables);
        combinedContext += `# Bot Knowledge Base\n\n${processedBotContext}\n\n`;
      }
    }

    if (decision.useCustomContext) {
      const guildContext = await this.getGuildContext(guildId);
      if (guildContext?.content) {
        // Also apply template replacement to custom context in case users use variables
        const processedCustomContext = this.replaceTemplateVariables(
          guildContext.content,
          templateVariables
        );
        combinedContext += `# Server-Specific Information\n\n${processedCustomContext}\n\n`;
      }
    }

    return combinedContext.trim();
  }

  /**
   * Clear context cache for a guild
   */
  private async clearContextCache(guildId: string): Promise<void> {
    if (redisClient?.isReady) {
      const cacheKey = `guild_ai_context:${guildId}`;
      await redisClient.del(cacheKey);
    }
  }

  /**
   * Get context sources used for a response (for display)
   */
  async getContextSources(guildId: string, query: string): Promise<string[]> {
    const decision = await this.determineContextUsage(query, guildId);
    return decision.selectedSources;
  }
}

// Export singleton instance
export const contextService = new ContextService();
export default contextService;
