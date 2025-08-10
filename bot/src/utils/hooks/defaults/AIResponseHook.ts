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
import { DocumentationService } from "../../../services/DocumentationService";

const env = FetchEnvs();

/**
 * AI Response Hook - Provides AI-powered responses for modmail inquiries
 * Can be configured per server/category with custom prompts and behaviors
 */
export class AIResponseHook extends BaseHook {
  private openai: OpenAI | null = null;
  private documentationService: DocumentationService;

  constructor() {
    super(
      "ai-response",
      "AI Response Hook",
      "Provides AI-powered responses for modmail inquiries",
      HookType.BEFORE_CREATION,
      HookPriority.LOW // Run after server/category selection but before creation
    );

    // Initialize services
    this.documentationService = new DocumentationService();

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
        selectedGuild.guild.id,
        selectedGuild.guild.name,
        ctx.selectedCategoryId,
        selectedCategory.name,
        ctx.formResponses,
        selectedGuild.config
      );

      log.debug(`AIResponseHook: AI response generated: ${aiResponse ? "yes" : "no"}`, {
        responseLength: aiResponse?.length,
      });

      if (aiResponse) {
        log.debug(`AIResponseHook: Sending AI response to user...`);
        // Send AI response to user before creating modmail
        await this.sendAIResponse(ctx, aiResponse, aiConfig);
        log.debug(`AIResponseHook: AI response sent successfully`);

        // Optionally prevent modmail creation if AI fully resolved the issue
        if (aiConfig.preventModmailCreation) {
          // Return success=true, continue=false (cancel-ok state)
          // This means AI successfully handled the request and modmail creation is not needed
          return this.createStopResult({
            aiResponseSent: true,
            preventModmailCreation: true,
          });
        }
      } else {
        log.debug(`AIResponseHook: No AI response generated, continuing with modmail creation`);
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
    guildId: string,
    guildName: string,
    categoryId: string,
    categoryName: string,
    formResponses?: Record<string, any>,
    guildConfig?: any
  ): Promise<string | null> {
    if (!this.openai) return null;

    try {
      log.debug(`AIResponseHook: Starting AI response generation`, {
        userMessage: userMessage.substring(0, 50) + "...",
        guildName,
        categoryName,
        hasFormResponses: !!formResponses,
      });
      let systemPrompt = `You are an AI assistant for the ${guildName} Discord server's modmail system, helping users with the "${categoryName}" category.

CORE OBJECTIVES:
- Provide accurate, helpful answers to user questions
- Determine if the user's issue can be fully resolved without human assistance
- Guide users appropriately based on their needs

RESPONSE GUIDELINES:
- Be concise but comprehensive - aim for 1-3 sentences for simple questions, longer for complex issues
- Use a ${aiConfig.responseStyle || "helpful"} tone
- If you can fully resolve the user's question, clearly state that the issue is resolved
- If human assistance is needed, explain why and encourage creating a support ticket

ADMIN-PROVIDED CONTEXT:
${aiConfig.systemPrompt || "No specific guidance provided by server administrators."}

DECISION FRAMEWORK:
✅ Can resolve: Simple questions with obvious answers OR issues explicitly addressed in the provided documentation
❌ Needs human help: Everything else - complex questions, account-specific issues, anything not clearly documented, policy decisions, or requests requiring server permissions`;

      // Get stored documentation
      const documentationContent = await this.documentationService.getDocumentationForAI(
        guildId,
        categoryId,
        aiConfig.useGlobalDocumentation
      );

      // Add documentation to system prompt if available
      if (documentationContent) {
        systemPrompt += `

KNOWLEDGE BASE:
You have access to server-specific documentation. Reference this information to provide accurate answers:${documentationContent}

DOCUMENTATION USAGE RULES:
1. ONLY ANSWER what is explicitly documented - do not extrapolate or assume
2. PRIORITY SYSTEM: Category documentation (marked "PRIORITY") takes precedence over server documentation (marked "FALLBACK")
3. CATEGORY FIRST: If both category and server docs address the same topic, ALWAYS use the category-specific information
4. FALLBACK USAGE: Only use server/global documentation when category docs don't cover the specific topic
5. CONSISTENCY: Follow the documented approach exactly as written
5. STRICT BOUNDARIES: If the documentation doesn't explicitly address the user's specific question, recommend human support

RESPONSE REQUIREMENTS:
- ONLY provide answers that are directly supported by the documentation
- Quote or reference specific documentation sections when possible
- If the documentation partially covers the topic but doesn't fully answer the question, recommend human assistance
- If the documentation doesn't address the question at all, clearly state this and recommend creating a support ticket
- When in doubt, always recommend human support rather than guessing`;
      } else {
        systemPrompt += `

KNOWLEDGE BASE: No server-specific documentation is available. Base your responses on general best practices and clearly indicate when human assistance is needed for server-specific information.`;
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

      log.debug(`AIResponseHook: Making OpenAI API call`, {
        model: "gpt-5-mini",
        conversationLength: conversation.length,
        maxTokens: aiConfig.maxTokens,
      });

      const response = await this.openai.chat.completions.create({
        model: "gpt-5-mini", // Use gpt-5-mini with reasoning
        messages: conversation as any,
        max_completion_tokens: aiConfig.maxTokens + 1000, // Add extra tokens for reasoning
        // Note: gpt-5-mini only supports default temperature (1)
        reasoning_effort: "low", // Use low reasoning effort
      });

      log.debug(`AIResponseHook: OpenAI API response received`, {
        hasContent: !!response.choices[0]?.message?.content,
        usage: response.usage,
        choicesLength: response.choices?.length,
        firstChoice: response.choices[0]
          ? {
              message: {
                role: response.choices[0].message?.role,
                hasContent: !!response.choices[0].message?.content,
                contentLength: response.choices[0].message?.content?.length,
                hasReasoning: !!(response.choices[0].message as any)?.reasoning,
                reasoningLength: (response.choices[0].message as any)?.reasoning?.length,
              },
              finishReason: response.choices[0].finish_reason,
            }
          : null,
      });

      // For reasoning models, the actual response content is in message.content
      // The reasoning is in message.reasoning (which we can ignore for user responses)
      if (response.choices[0]?.message?.content) {
        const content = await ResponsePlugins(response.choices[0].message.content);
        log.debug(`AIResponseHook: Processed content length: ${content?.length}`);
        return content;
      }

      // Fallback: if no content but there's reasoning, log it for debugging
      const reasoning = (response.choices[0]?.message as any)?.reasoning;
      if (reasoning) {
        log.debug(`AIResponseHook: Only reasoning found, no user-facing content`, {
          reasoningPreview: reasoning.substring(0, 100) + "...",
        });
      }

      log.warn(`AIResponseHook: No content in OpenAI response`, {
        response: JSON.stringify(response, null, 2),
      });

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
