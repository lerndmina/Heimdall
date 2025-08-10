import { BaseHook } from "../BaseHook";
import {
  HookType,
  HookPriority,
  BeforeCreationHookContext,
  HookResult,
  HookContext,
} from "../HookTypes";
import OpenAI from "openai";
import FetchEnvs, { isOptionalUnset } from "../../FetchEnvs";
import log from "../../log";
import ResponsePlugins from "../../ResponsePlugins";
import BasicEmbed from "../../BasicEmbed";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { redisClient } from "../../../Bot";

const env = FetchEnvs();

/**
 * AI Response Hook - Provides AI-powered responses for modmail inquiries
 * Can be configured per server/category with custom prompts and behaviors
 */
export class AIResponseHook extends BaseHook {
  private openai: OpenAI | null = null;

  constructor() {
    super(
      "ai-response",
      "AI Response Hook",
      "Provides AI-powered responses for modmail inquiries",
      HookType.BEFORE_CREATION,
      HookPriority.LOW // Run after server/category selection but before creation
    );

    // Initialize OpenAI if API key is available
    if (!isOptionalUnset(env.OPENAI_API_KEY)) {
      this.openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });
    }
  }

  protected async executeHook(context: HookContext): Promise<HookResult> {
    const ctx = context as BeforeCreationHookContext;

    log.debug(`AIResponseHook: Starting execution for user ${ctx.user.id}`);

    // Skip if OpenAI is not configured
    if (!this.openai) {
      log.debug("OpenAI not configured, skipping AI response hook");
      return this.createSuccessResult();
    }

    log.debug(`AIResponseHook: OpenAI is configured`);

    // Skip if no guild/category is selected yet
    if (!ctx.selectedGuildId || !ctx.selectedCategoryId) {
      log.debug(
        `AIResponseHook: Missing guild/category selection. Guild: ${ctx.selectedGuildId}, Category: ${ctx.selectedCategoryId}`
      );
      return this.createSuccessResult();
    }

    log.debug(
      `AIResponseHook: Guild/category selected. Guild: ${ctx.selectedGuildId}, Category: ${ctx.selectedCategoryId}`
    );

    try {
      // Get the selected guild and category configuration
      const selectedGuild = ctx.availableGuilds.find((g) => g.guild.id === ctx.selectedGuildId);
      if (!selectedGuild) {
        log.debug(`AIResponseHook: Selected guild not found in availableGuilds`);
        return this.createSuccessResult();
      }

      log.debug(`AIResponseHook: Found selected guild: ${selectedGuild.guild.name}`);

      const selectedCategory = this.getSelectedCategory(
        selectedGuild.config,
        ctx.selectedCategoryId
      );
      if (!selectedCategory) {
        log.debug(`AIResponseHook: Selected category not found`);
        return this.createSuccessResult();
      }

      log.debug(`AIResponseHook: Found selected category: ${selectedCategory.name}`);

      // Check if AI is enabled for this server/category
      const aiConfig = this.getAIConfig(selectedGuild.config, selectedCategory);
      log.debug(`AIResponseHook: AI config enabled: ${aiConfig.enabled}`);

      if (!aiConfig.enabled) {
        log.debug(`AIResponseHook: AI not enabled for this server/category`);
        return this.createSuccessResult();
      }

      log.debug(`AIResponseHook: AI is enabled, generating response...`);

      // Generate AI response
      const aiResponse = await this.generateAIResponse(
        ctx.messageContent,
        aiConfig,
        selectedGuild.guild.name,
        selectedCategory.name,
        ctx.formResponses,
        selectedGuild.config
      );

      if (aiResponse) {
        // Send AI response to user before creating modmail
        await this.sendAIResponse(ctx, aiResponse, aiConfig);

        // Optionally prevent modmail creation if AI fully resolved the issue
        if (aiConfig.preventModmailCreation) {
          // Return success=true, continue=false (cancel-ok state)
          // This means AI successfully handled the request and modmail creation is not needed
          return this.createStopResult({
            aiResponseSent: true,
            preventModmailCreation: true,
          });
        }
      }

      return this.createSuccessResult({ aiResponseSent: !!aiResponse });
    } catch (error) {
      log.error("Error in AI response hook:", error);
      // Don't fail the entire modmail process if AI fails
      return this.createSuccessResult();
    }
  }

  /**
   * Get the selected category from config
   */
  private getSelectedCategory(config: any, categoryId: string) {
    // Check default category
    if (config.defaultCategory?.id === categoryId) {
      return config.defaultCategory;
    }

    // Check additional categories
    return config.categories?.find((cat: any) => cat.id === categoryId);
  }

  /**
   * Get AI configuration for server/category
   */
  private getAIConfig(config: any, category: any) {
    // Check if category has specific AI config
    if (category.aiConfig?.enabled) {
      return {
        enabled: true,
        systemPrompt:
          category.aiConfig.systemPrompt ||
          this.getSystemPrompt(config.guildDescription, category.name, category.description),
        preventModmailCreation: category.aiConfig.preventModmailCreation || false,
        includeFormData: category.aiConfig.includeFormData !== false,
        responseStyle: category.aiConfig.responseStyle || "helpful",
        maxTokens: category.aiConfig.maxTokens || 500,
        documentationUrl: category.aiConfig.documentationUrl || null,
        // Global documentation is included by default unless explicitly disabled
        useGlobalDocumentation: category.aiConfig.useGlobalDocumentation !== false,
      };
    }

    // Fall back to global AI config if enabled and fallback is allowed
    if (config.globalAIConfig?.enabled && config.globalAIConfig?.fallbackToGlobal !== false) {
      return {
        enabled: true,
        systemPrompt:
          config.globalAIConfig.systemPrompt ||
          this.getSystemPrompt(config.guildDescription, category.name, category.description),
        preventModmailCreation: config.globalAIConfig.preventModmailCreation || false,
        includeFormData: config.globalAIConfig.includeFormData !== false,
        responseStyle: config.globalAIConfig.responseStyle || "helpful",
        maxTokens: config.globalAIConfig.maxTokens || 500,
        documentationUrl: config.globalAIConfig.documentationUrl || null,
        // When using global config, global documentation is always included
        useGlobalDocumentation: true,
      };
    }

    // No AI configuration found or enabled
    return {
      enabled: false,
      systemPrompt: "",
      preventModmailCreation: false,
      includeFormData: true,
      responseStyle: "helpful",
      maxTokens: 500,
      documentationUrl: null,
      useGlobalDocumentation: false,
    };
  }

  /**
   * Fetch documentation from URL with caching
   */
  private async fetchDocumentation(url: string, cacheKey: string): Promise<string | null> {
    try {
      // Check Redis cache first (cache for 1 hour)
      if (redisClient) {
        try {
          const cached = await redisClient.get(cacheKey);
          if (cached) {
            log.debug(`Documentation cache hit for: ${url}`);
            return cached;
          }
        } catch (cacheError) {
          log.warn("Redis cache error, continuing without cache:", cacheError);
        }
      }

      log.debug(`Fetching documentation from: ${url}`);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        // Fetch documentation from URL
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Heimdall-Discord-Bot/1.0",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          log.warn(
            `Failed to fetch documentation from ${url}: ${response.status} ${response.statusText}`
          );
          return null;
        }

        const documentation = await response.text();

        // Limit documentation size to prevent token overflow (max 8000 characters)
        const truncatedDocs =
          documentation.length > 8000
            ? documentation.substring(0, 8000) + "\n\n[Documentation truncated due to length...]"
            : documentation;

        // Cache the documentation
        if (redisClient) {
          try {
            await redisClient.setEx(cacheKey, 3600, truncatedDocs); // Cache for 1 hour
          } catch (cacheError) {
            log.warn("Failed to cache documentation:", cacheError);
          }
        }

        log.debug(`Successfully fetched documentation (${truncatedDocs.length} characters)`);
        return truncatedDocs;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      log.error(`Error fetching documentation from ${url}:`, error);
      return null;
    }
  }

  /**
   * Generate system prompt based on server/category context
   */
  private getSystemPrompt(
    guildDescription?: string,
    categoryName?: string,
    categoryDescription?: string
  ): string {
    let prompt = `You are a helpful AI assistant for a Discord server's modmail system.`;

    if (guildDescription) {
      prompt += ` Server context: ${guildDescription}`;
    }

    if (categoryName) {
      prompt += ` The user is asking about: ${categoryName}`;
    }

    if (categoryDescription) {
      prompt += ` Category description: ${categoryDescription}`;
    }

    prompt += `\n\nPlease provide a helpful response to the user's inquiry. If you can fully resolve their question, say so. If they need human assistance, encourage them to proceed with creating a support ticket.`;

    return prompt;
  }

  /**
   * Generate AI response using OpenAI
   */
  private async generateAIResponse(
    userMessage: string,
    aiConfig: any,
    guildName: string,
    categoryName: string,
    formResponses?: Record<string, any>,
    guildConfig?: any
  ): Promise<string | null> {
    if (!this.openai) return null;

    try {
      let systemPrompt = `
      You are a helpful AI assistant for the ${guildName} Discord server's modmail system.
      The user is asking about the "${categoryName}" category.

      The Discord Server Admins have provided the following system prompt to guide your responses:
      ${aiConfig.systemPrompt || "No specific system prompt provided."}

      Please provide a concise, helpful response to the user's inquiry.

      Please keep your responses short and sweet while conveying enough information to solve the user's query
    `;

      // Fetch documentation if available
      let documentationContent = "";

      // Always try to get global documentation first (if available and not explicitly disabled)
      if (aiConfig.useGlobalDocumentation && guildConfig?.globalAIConfig?.documentationUrl) {
        const globalCacheKey = `ai_docs:global:${guildConfig.globalAIConfig.documentationUrl}`;
        const globalDocs = await this.fetchDocumentation(
          guildConfig.globalAIConfig.documentationUrl,
          globalCacheKey
        );
        if (globalDocs) {
          documentationContent += `\n\n--- Server Documentation ---\n${globalDocs}`;
          log.debug(`Added global documentation to AI context`);
        }
      }

      // Then get category-specific documentation (if available)
      if (aiConfig.documentationUrl) {
        const cacheKey = `ai_docs:category:${aiConfig.documentationUrl}`;
        const docs = await this.fetchDocumentation(aiConfig.documentationUrl, cacheKey);
        if (docs) {
          documentationContent += `\n\n--- Category-Specific Documentation ---\n${docs}`;
          log.debug(`Added category-specific documentation to AI context`);
        }
      }

      // Add documentation to system prompt if available
      if (documentationContent) {
        systemPrompt += `\n\nYou have access to the following documentation that should be used to answer user questions:${documentationContent}

IMPORTANT: When both server documentation and category-specific documentation are provided:
1. Use the server documentation as your baseline knowledge
2. Use the category-specific documentation for detailed, category-relevant information
3. If there are conflicts, prioritize the category-specific documentation as it's more specific
4. Combine information from both sources when helpful

Please reference this documentation when answering questions. If the documentation contains relevant information, use it to provide accurate answers. If the user's question cannot be answered from the documentation, let them know that you'll need to connect them with human support.`;
      }

      const conversation = [{ role: "system", content: systemPrompt }];

      // Add form responses if available and enabled
      if (aiConfig.includeFormData && formResponses) {
        const formContext = Object.entries(formResponses)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n");

        conversation.push({
          role: "user",
          content: `Additional context from form:\n${formContext}\n\nUser message: ${userMessage}`,
        });
      } else {
        conversation.push({
          role: "user",
          content: userMessage,
        });
      }

      const response = await this.openai.chat.completions.create({
        model: "gpt-5-mini", // Use a more capable model for modmail
        messages: conversation as any,
        max_completion_tokens: aiConfig.maxTokens,
        reasoning_effort: "low",
        service_tier: "flex",
      });

      if (response.choices[0]?.message?.content) {
        return await ResponsePlugins(response.choices[0].message.content);
      }

      return null;
    } catch (error) {
      log.error("OpenAI API error:", error);
      return null;
    }
  }

  /**
   * Send AI response to user
   */
  private async sendAIResponse(
    context: BeforeCreationHookContext,
    aiResponse: string,
    aiConfig: any
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle("🤖 AI Assistant")
      .setDescription(aiResponse)
      .setColor(0x00ff00)
      .setFooter({
        text: aiConfig.preventModmailCreation
          ? "If this doesn't fully answer your question, click the button below to continue with creating a support ticket."
          : "If this helps, great! If not, we'll proceed with your support request.",
      });

    const messagePayload: any = { embeds: [embed], content: "" };

    // Add "Continue with Modmail" button if modmail creation is prevented
    if (aiConfig.preventModmailCreation) {
      // Store the context in Redis for later retrieval when button is clicked
      const contextKey = `ai_modmail_context:${context.user.id}:${Date.now()}`;
      const contextData = {
        userId: context.user.id,
        guildId: context.selectedGuildId,
        categoryId: context.selectedCategoryId,
        messageContent: context.messageContent,
        formResponses: context.formResponses,
        formMetadata: context.formMetadata,
        priority: context.priority,
        ticketNumber: context.ticketNumber,
        requestId: context.requestId,
        aiResponse: aiResponse, // Include AI response for staff context
      };

      // Store context for 1 hour
      if (redisClient) {
        try {
          await redisClient.setEx(contextKey, 3600, JSON.stringify(contextData));
        } catch (error) {
          log.error("Failed to store AI modmail context in Redis:", error);
        }
      }

      const continueButton = new ButtonBuilder()
        .setCustomId(`ai_continue_modmail:${contextKey}`)
        .setLabel("📧 Continue with Support Ticket")
        .setStyle(ButtonStyle.Primary);

      const cancelButton = new ButtonBuilder()
        .setCustomId(`ai_cancel_modmail:${contextKey}`)
        .setLabel("✅ I'm All Set")
        .setStyle(ButtonStyle.Secondary);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        continueButton,
        cancelButton
      );
      messagePayload.components = [actionRow];
    }

    if (context.sharedBotMessage) {
      await context.sharedBotMessage.edit(messagePayload);
    } else {
      await context.user.send(messagePayload);
    }
  }
}
