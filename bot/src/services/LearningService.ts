import {
  Client,
  TextChannel,
  ThreadChannel,
  Message,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ComponentType,
} from "discord.js";
import OpenAI from "openai";
import ModmailDocumentation from "../models/ModmailDocumentation";
import ModmailConfig from "../models/ModmailConfig";
import { DocumentationService } from "./DocumentationService";
import Database from "../utils/data/database";
import log from "../utils/log";
import { redisClient } from "../Bot";

export interface ModmailThreadTranscript {
  threadId: string;
  guildId: string;
  categoryId: string;
  userId: string;
  messages: {
    authorId: string;
    authorName: string;
    content: string;
    timestamp: Date;
    isStaff: boolean;
  }[];
  closedAt: Date;
  openedAt: Date;
  duration: number; // in minutes
}

export class LearningService {
  private db: Database;
  private documentationService: DocumentationService;
  private openai: OpenAI;

  constructor() {
    this.db = new Database();
    this.documentationService = new DocumentationService();

    // Initialize OpenAI
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required for learning service");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Resolve the actual category UUID from a potential forum channel ID or validate existing category ID
   */
  private async resolveCategoryId(
    guildId: string,
    categoryOrChannelId: string
  ): Promise<string | null> {
    try {
      log.debug(`LearningService: Resolving category ID for`, {
        guildId,
        categoryOrChannelId,
      });

      const config = await this.db.findOne(ModmailConfig, { guildId }, true);
      if (!config) {
        log.warn(`LearningService: No modmail config found for guild ${guildId}`);
        return null;
      }

      // First, check if this is already a valid category UUID
      if (categoryOrChannelId === "default") {
        log.debug(`LearningService: Using default category`);
        return "default";
      }

      // Check if it's an existing category ID
      const existingCategory = config.categories?.find((cat) => cat.id === categoryOrChannelId);
      if (existingCategory) {
        log.debug(`LearningService: Found existing category ${existingCategory.id}`);
        return existingCategory.id;
      }

      // If not found as category ID, try to resolve from forum channel ID
      // Check if it's the default category (legacy forumChannelId)
      if (config.forumChannelId === categoryOrChannelId) {
        log.debug(
          `LearningService: Using default category for forum channel ${categoryOrChannelId}`
        );
        return "default";
      }

      // Check custom categories by forum channel ID
      const category = config.categories?.find((cat) => cat.forumChannelId === categoryOrChannelId);
      if (category) {
        log.debug(
          `LearningService: Found category ${category.id} for forum channel ${categoryOrChannelId}`
        );
        return category.id;
      }

      log.warn(`LearningService: No category found for ${categoryOrChannelId}`);
      return null;
    } catch (error) {
      log.error("LearningService: Error resolving category ID:", error);
      return null;
    }
  }

  /**
   * Step 1: Extract learnings from a modmail conversation using AI
   */
  private async extractLearningsFromConversation(
    transcript: ModmailThreadTranscript
  ): Promise<string | null> {
    try {
      log.debug(`LearningService: Extracting learnings from conversation`, {
        threadId: transcript.threadId,
        messageCount: transcript.messages.length,
      });

      // Format the conversation for AI analysis
      const conversationText = transcript.messages
        .map((msg) => `[${msg.isStaff ? "STAFF" : "USER"}] ${msg.authorName}: ${msg.content}`)
        .join("\n");

      const systemPrompt = `You are an AI assistant analyzing modmail conversations to extract actionable knowledge that can help improve future AI responses.

EXTRACTION OBJECTIVES:
- Identify common user questions and effective staff responses
- Extract patterns in problem-solving approaches
- Document specific solutions that worked
- Note any procedural knowledge or troubleshooting steps
- Identify frequently asked questions and their answers

CONVERSATION CONTEXT:
Duration: ${transcript.duration} minutes
Messages: ${transcript.messages.length}
Category: ${transcript.categoryId}

EXTRACTION GUIDELINES:
1. Focus on ACTIONABLE knowledge - what can help resolve similar issues in the future
2. Extract specific solutions, not general conversation flow
3. Include technical details, steps, or procedures mentioned
4. Note any links, resources, or tools referenced
5. Identify the root cause and resolution if clear
6. Format as clear, concise knowledge points
7. KEEP IT CONCISE: Document each feature/issue in under 30 lines unless absolutely critical

OUTPUT FORMAT:
Return extracted learnings in this structure:
## Issue Type: [Brief description of the issue category]

### Problem Pattern:
[What the user typically asks or experiences]

### Solution Approach:
[How staff typically resolve this]

### Key Knowledge Points:
- [Specific actionable point 1]
- [Specific actionable point 2]
- [etc.]

### Resources/References:
[Any links, commands, or tools mentioned]

If the conversation doesn't contain actionable knowledge for future AI responses, return "NO_ACTIONABLE_LEARNINGS"`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Please analyze this modmail conversation and extract actionable learnings:\n\n${conversationText}`,
          },
        ],
        max_completion_tokens: 1500, // Extra tokens for reasoning
        reasoning_effort: "low",
      });

      log.debug(`LearningService: AI extraction response received`, {
        hasContent: !!response.choices[0]?.message?.content,
        usage: response.usage,
        finishReason: response.choices[0]?.finish_reason,
      });

      if (response.choices[0]?.message?.content) {
        const extractedLearnings = response.choices[0].message.content.trim();

        if (extractedLearnings === "NO_ACTIONABLE_LEARNINGS") {
          log.debug(`LearningService: No actionable learnings found in conversation`);
          return null;
        }

        log.debug(`LearningService: Successfully extracted learnings`, {
          length: extractedLearnings.length,
        });

        return extractedLearnings;
      }

      log.warn(`LearningService: No content in AI extraction response`);
      return null;
    } catch (error) {
      log.error("LearningService: Error extracting learnings from conversation:", error);
      return null;
    }
  }

  /**
   * Step 2: Intelligently merge new learnings with existing documentation using AI
   */
  private async intelligentMergeLearnings(
    newLearnings: string,
    existingDocumentation: string | null,
    guildId: string,
    categoryId: string
  ): Promise<string | null> {
    try {
      log.debug(`LearningService: Merging learnings with existing documentation`, {
        newLearningsLength: newLearnings.length,
        hasExistingDoc: !!existingDocumentation,
        existingDocLength: existingDocumentation?.length || 0,
      });

      const systemPrompt = `You are an AI assistant responsible for intelligently merging new knowledge into existing documentation.

MERGE OBJECTIVES:
- Integrate new learnings with existing documentation
- Resolve conflicts by prioritizing more recent/accurate information
- Remove outdated or contradictory information
- Organize information logically and avoid duplication
- Maintain a clean, actionable knowledge base
- KEEP DOCUMENTATION CONCISE: Each feature/topic should not exceed 30 lines unless absolutely necessary

MERGE GUIDELINES:
1. INTEGRATION: Merge complementary information seamlessly
2. CONFLICT RESOLUTION: When new info conflicts with existing, prioritize the newer information and note the change
3. DEDUPLICATION: Remove redundant information
4. ORGANIZATION: Group similar topics together
5. CLARITY: Ensure the final document is clear and actionable
6. EVOLUTION: The documentation should evolve and improve, not just grow
7. BREVITY: Prioritize concise, actionable information over lengthy explanations
8. FOCUS: Keep each section focused on essential information only
9. RETAIN OLD DATA: If there are no conflicts for a section of the documentation, retain the old data exactly as it is. Unless there is a conflict, do not change existing documentation. Then only change the conflicting parts.

OUTPUT REQUIREMENTS:
- Return the complete merged documentation
- Maintain clear structure with headings and bullet points
- Keep the most relevant and actionable information
- Remove outdated information that conflicts with new learnings
- If existing documentation is empty/null, return just the new learnings properly formatted
- STRICT LENGTH CONTROL: Keep individual topics under 30 lines each

IMPORTANT: Return ONLY the final merged documentation content, no explanations or meta-commentary.`;

      const userPrompt = existingDocumentation
        ? `Please merge these new learnings with the existing documentation:

NEW LEARNINGS:
${newLearnings}

EXISTING DOCUMENTATION:
${existingDocumentation}

Return the complete merged documentation with conflicts resolved and information properly organized.`
        : `Please format and organize these learnings as the initial documentation:

${newLearnings}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 25000, // Extra tokens for reasoning + longer output
        reasoning_effort: "low",
      });

      log.debug(`LearningService: AI merge response received`, {
        hasContent: !!response.choices[0]?.message?.content,
        usage: response.usage,
        finishReason: response.choices[0]?.finish_reason,
      });

      if (response.choices[0]?.message?.content) {
        const mergedDocumentation = response.choices[0].message.content.trim();

        log.debug(`LearningService: Successfully merged documentation`, {
          finalLength: mergedDocumentation.length,
          originalLength: existingDocumentation?.length || 0,
          newLength: newLearnings.length,
        });

        return mergedDocumentation;
      }

      log.warn(`LearningService: No content in AI merge response`);
      return null;
    } catch (error) {
      log.error("LearningService: Error merging learnings:", error);
      return null;
    }
  }

  /**
   * Offer to learn from a modmail thread after it's closed
   */
  async offerLearningFromThread(
    client: Client,
    transcript: ModmailThreadTranscript,
    channel: TextChannel | ThreadChannel
  ): Promise<void> {
    try {
      log.debug(`LearningService: Offering learning from thread`, {
        threadId: transcript.threadId,
        duration: transcript.duration,
        messageCount: transcript.messages.length,
        guildId: transcript.guildId,
        categoryId: transcript.categoryId,
      });

      // For testing: Always offer learning regardless of duration/message count
      // TODO: Add back selective criteria in production

      // Create learning consent UI
      const embed = new EmbedBuilder()
        .setTitle("🤖 AI Learning Opportunity")
        .setDescription(
          `The bot can learn from this modmail thread to improve future responses.\n\n` +
            `**Thread Details:**\n` +
            `• Duration: ${Math.round(transcript.duration)} minutes\n` +
            `• Messages: ${transcript.messages.length}\n` +
            `• Category: <#${transcript.categoryId}>\n\n` +
            `**What will happen:**\n` +
            `• AI will analyze the conversation for useful patterns\n` +
            `• Extract knowledge about common issues and solutions\n` +
            `• Store learnings to help with similar future tickets\n` +
            `• No personal information will be stored\n\n` +
            `Should the bot learn from this thread?`
        )
        .setColor(0x5865f2)
        .setFooter({ text: "Learning helps improve AI responses for future modmail" });

      const yesButton = new ButtonBuilder()
        .setCustomId(`learn_yes_${transcript.threadId}`)
        .setLabel("Yes, Learn from Thread")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🧠");

      const noButton = new ButtonBuilder()
        .setCustomId(`learn_no_${transcript.threadId}`)
        .setLabel("No, Skip Learning")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌");

      const previewButton = new ButtonBuilder()
        .setCustomId(`learn_preview_${transcript.threadId}`)
        .setLabel("Preview What Will Be Learned")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("👁️");

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        yesButton,
        previewButton,
        noButton
      );

      // Send the learning consent message
      const message = await channel.send({
        embeds: [embed],
        components: [row],
      });

      // Store transcript temporarily for processing
      await this.storeTranscriptTemporarily(transcript);

      // Set up button interaction handler with timeout
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000, // 5 minutes
      });

      collector.on("collect", async (interaction) => {
        if (!interaction.customId.includes(transcript.threadId)) return;

        await interaction.deferUpdate();

        if (interaction.customId.startsWith("learn_yes_")) {
          await this.processLearningFromThread(interaction, transcript, message);
        } else if (interaction.customId.startsWith("learn_preview_")) {
          await this.showLearningPreview(interaction, transcript);
        } else if (interaction.customId.startsWith("learn_no_")) {
          await this.cancelLearning(message, transcript.threadId);
        }
      });

      collector.on("end", async () => {
        // Timeout - clean up
        await this.cancelLearning(message, transcript.threadId);
      });
    } catch (error) {
      log.error("Error offering learning from thread:", error);
    }
  }

  /**
   * Process learning from a thread after consent is given
   */
  private async processLearningFromThread(
    interaction: any,
    transcript: ModmailThreadTranscript,
    message: Message
  ): Promise<void> {
    try {
      // First, resolve the correct category UUID from the forum channel ID
      const actualCategoryId = await this.resolveCategoryId(
        transcript.guildId,
        transcript.categoryId
      );
      if (!actualCategoryId) {
        log.error(
          `LearningService: Could not resolve category ID for forum channel ${transcript.categoryId}`
        );
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Category Resolution Error")
          .setDescription("Could not find the modmail category configuration for this thread.")
          .setColor(0xed4245);

        await message.edit({ embeds: [errorEmbed] });
        return;
      }

      // Update the transcript with the correct category ID
      transcript.categoryId = actualCategoryId;

      // Update the message to show processing
      const processingEmbed = new EmbedBuilder()
        .setTitle("🧠 Processing Learning...")
        .setDescription(
          "The AI is analyzing the thread and extracting useful knowledge. This may take a moment."
        )
        .setColor(0xfee75c);

      await message.edit({
        embeds: [processingEmbed],
        components: [],
      });

      // Step 1: Try to get cached learnings first, then extract if not available
      const cacheKey = `learning_preview:${transcript.threadId}`;
      let extractedLearnings: string | null;

      try {
        const cachedPreview = await redisClient.get(cacheKey);
        if (cachedPreview) {
          extractedLearnings = cachedPreview;
          log.debug(`Using cached preview for learning in thread ${transcript.threadId}`);
        } else {
          extractedLearnings = await this.extractLearningsFromConversation(transcript);
          log.debug(`Generated new learnings for thread ${transcript.threadId} (cache miss)`);
        }
      } catch (redisError) {
        log.error("Redis error during learning, proceeding without cache:", redisError);
        extractedLearnings = await this.extractLearningsFromConversation(transcript);
      }

      if (!extractedLearnings) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Learning Failed")
          .setDescription("The AI couldn't extract meaningful learnings from this thread.")
          .setColor(0xed4245);

        await message.edit({ embeds: [errorEmbed] });
        return;
      }

      // Step 2: Get existing documentation for this category
      const existingDoc = await this.documentationService.getDocumentation(
        transcript.guildId,
        "category",
        transcript.categoryId
      );

      // Step 3: Intelligently merge new learnings with existing documentation using gpt-5-mini
      const mergedDocumentation = await this.intelligentMergeLearnings(
        extractedLearnings,
        existingDoc?.documentation || null,
        transcript.guildId,
        transcript.categoryId
      );

      if (!mergedDocumentation) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Learning Failed")
          .setDescription("The AI couldn't merge the new learnings with existing documentation.")
          .setColor(0xed4245);

        await message.edit({ embeds: [errorEmbed] });
        return;
      }

      // Step 4: Store the merged documentation (this will replace the existing documentation)
      const result = await this.documentationService.storeDocumentation(
        transcript.guildId,
        mergedDocumentation,
        "category",
        transcript.categoryId
      );

      if (result.success) {
        const hadExisting = !!existingDoc?.documentation;
        const successEmbed = new EmbedBuilder()
          .setTitle("✅ Learning Complete")
          .setDescription(
            `The bot has successfully learned from this thread!\n\n` +
              `**Process:** AI extracted learnings and ${
                hadExisting ? "merged with existing knowledge" : "created new documentation"
              }\n` +
              `**Final Documentation:** ${mergedDocumentation.length} characters\n` +
              `**Category:** <#${transcript.categoryId}>\n\n` +
              `${
                hadExisting ? "Updated knowledge base" : "Created new knowledge base"
              } will help improve AI responses for similar future issues.`
          )
          .setColor(0x57f287);

        await message.edit({ embeds: [successEmbed] });

        // Clean up cache since learning is complete
        try {
          await redisClient.del(cacheKey);
          log.debug(`Cleaned up cache for thread ${transcript.threadId} after successful learning`);
        } catch (redisError) {
          log.error("Failed to delete cache after learning:", redisError);
        }

        // Close the thread after successful learning
        await this.closeThreadAfterLearning(message, transcript);

        log.info(
          `LearningService: Successfully ${
            hadExisting ? "updated" : "created"
          } documentation for category ${transcript.categoryId}`,
          {
            guildId: transcript.guildId,
            categoryId: transcript.categoryId,
            threadId: transcript.threadId,
            extractedLength: extractedLearnings.length,
            finalLength: mergedDocumentation.length,
            hadExisting,
          }
        );
      } else {
        throw new Error(result.error || "Failed to store learnings");
      }
    } catch (error) {
      log.error("Error processing learning from thread:", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Learning Error")
        .setDescription(
          `Failed to learn from thread: ${error instanceof Error ? error.message : "Unknown error"}`
        )
        .setColor(0xed4245);

      await message.edit({ embeds: [errorEmbed] });

      // Close the thread after error
      await this.closeThreadAfterLearning(message, transcript);
    } finally {
      // Clean up temporary transcript
      await this.cleanupTemporaryTranscript(transcript.threadId);
    }
  }

  /**
   * Show a preview of what will be learned
   */
  private async showLearningPreview(
    interaction: any,
    transcript: ModmailThreadTranscript
  ): Promise<void> {
    try {
      await interaction.followUp({ content: "Generating preview...", ephemeral: true });

      // First, resolve the correct category UUID from the forum channel ID
      const actualCategoryId = await this.resolveCategoryId(
        transcript.guildId,
        transcript.categoryId
      );
      if (!actualCategoryId) {
        log.error(
          `LearningService: Could not resolve category ID for forum channel ${transcript.categoryId}`
        );
        await interaction.editReply({
          content: "❌ Error: Could not find the modmail category configuration for this thread.",
        });
        return;
      }

      // Update the transcript with the correct category ID
      transcript.categoryId = actualCategoryId;

      const cacheKey = `learning_preview:${transcript.threadId}`;
      let extractedLearnings: string | null;

      // Try to get cached preview first
      try {
        const cachedPreview = await redisClient.get(cacheKey);
        if (cachedPreview) {
          extractedLearnings = cachedPreview;
          log.debug(`Using cached preview for thread ${transcript.threadId}`);
        } else {
          // Generate new preview and cache it
          extractedLearnings = await this.extractLearningsFromConversation(transcript);
          if (extractedLearnings) {
            await redisClient.setEx(cacheKey, 86400, extractedLearnings); // 1 day TTL
            log.debug(`Generated and cached new preview for thread ${transcript.threadId}`);
          }
        }
      } catch (redisError) {
        log.error("Redis error during preview, generating without caching:", redisError);
        extractedLearnings = await this.extractLearningsFromConversation(transcript);
      }

      if (!extractedLearnings) {
        await interaction.editReply({
          content:
            "❌ Could not generate preview - the AI couldn't extract meaningful learnings from this thread.",
        });
        return;
      }

      // Truncate for preview if too long
      const preview =
        extractedLearnings.length > 1500
          ? extractedLearnings.substring(0, 1500) + "..."
          : extractedLearnings;

      const previewEmbed = new EmbedBuilder()
        .setTitle("👁️ Learning Preview")
        .setDescription(
          `Here's what the AI would extract from this thread:\n\n\`\`\`\n${preview}\n\`\`\``
        )
        .setColor(0x5865f2)
        .setFooter({
          text: "These learnings would be intelligently merged with existing documentation",
        });

      await interaction.editReply({ content: "", embeds: [previewEmbed] });
    } catch (error) {
      log.error("Error generating learning preview:", error);
      await interaction.editReply({ content: "❌ Failed to generate preview" });
    }
  }

  /**
   * Generate learnings from a transcript using AI
   */
  private async generateLearningsFromTranscript(
    transcript: ModmailThreadTranscript
  ): Promise<string | null> {
    try {
      // Format the transcript for AI analysis
      const formattedTranscript = this.formatTranscriptForAI(transcript);

      const systemPrompt = `You are an AI assistant that analyzes Discord modmail conversations to extract useful knowledge for improving future customer support responses.

Your task is to analyze the conversation and extract:
1. Common issues or problems mentioned
2. Effective solutions or responses that staff provided
3. Useful information about server rules, procedures, or policies
4. Patterns of user behavior and effective ways to handle them

Guidelines:
- Focus on ACTIONABLE knowledge that would help staff handle similar issues
- Do NOT include personal information (usernames, IDs, specific personal details)
- Do NOT include off-topic chat or irrelevant conversation
- Keep responses concise but informative
- Format as clear, useful documentation that staff could reference

If the conversation doesn't contain useful learnable content, respond with "NO_USEFUL_CONTENT".

Extract learnings in this format:
## Issue Type: [brief description]
**Problem:** [what the user needed help with]
**Solution:** [how staff resolved it]
**Key Points:** [important details or procedures to remember]

---`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: formattedTranscript },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content?.trim();

      if (!content || content === "NO_USEFUL_CONTENT") {
        return null;
      }

      return content;
    } catch (error) {
      log.error("Error generating learnings from transcript:", error);
      return null;
    }
  }

  /**
   * Format transcript for AI analysis
   */
  private formatTranscriptForAI(transcript: ModmailThreadTranscript): string {
    let formatted = `MODMAIL THREAD ANALYSIS\n`;
    formatted += `Duration: ${Math.round(transcript.duration)} minutes\n`;
    formatted += `Total Messages: ${transcript.messages.length}\n\n`;
    formatted += `CONVERSATION:\n`;

    for (const msg of transcript.messages) {
      // Sanitize content - remove mentions, IDs, etc.
      let sanitizedContent = msg.content
        .replace(/<@!?\d+>/g, "[USER_MENTION]")
        .replace(/<#\d+>/g, "[CHANNEL_MENTION]")
        .replace(/<:\w+:\d+>/g, "[EMOJI]")
        .replace(/\bhttps?:\/\/\S+/g, "[URL]");

      // Remove very long messages or code blocks to focus on the conversation
      if (sanitizedContent.length > 500) {
        sanitizedContent = sanitizedContent.substring(0, 500) + "[TRUNCATED]";
      }

      const role = msg.isStaff ? "STAFF" : "USER";
      formatted += `${role}: ${sanitizedContent}\n`;
    }

    return formatted;
  }

  /**
   * Cancel learning process
   */
  private async cancelLearning(message: Message, threadId: string): Promise<void> {
    const cancelledEmbed = new EmbedBuilder()
      .setTitle("❌ Learning Cancelled")
      .setDescription("Learning from this thread was cancelled or timed out.")
      .setColor(0x747f8d);

    await message.edit({
      embeds: [cancelledEmbed],
      components: [],
    });

    // Clean up cache when learning is cancelled
    try {
      const cacheKey = `learning_preview:${threadId}`;
      await redisClient.del(cacheKey);
      log.debug(`Cleaned up cache for thread ${threadId} after cancellation`);
    } catch (redisError) {
      log.error("Failed to delete cache after cancelling learning:", redisError);
    }

    // Close the thread after cancellation
    await this.closeThreadAfterLearning(message, { threadId });

    await this.cleanupTemporaryTranscript(threadId);
  }

  /**
   * Close the thread after learning process is complete
   */
  private async closeThreadAfterLearning(
    message: Message,
    transcript: { threadId: string }
  ): Promise<void> {
    try {
      log.debug(`LearningService: Closing thread ${transcript.threadId} after learning`);

      // Wait a moment for staff to read the final message
      setTimeout(async () => {
        try {
          const channel = message.channel;
          if (channel?.isThread()) {
            // Fetch fresh thread data to get current archived state
            await channel.fetch();

            // Check if thread is already archived before trying to close it
            if (!channel.archived) {
              try {
                await channel.setArchived(true);
                await channel.setLocked(true);
                log.debug(`LearningService: Successfully closed thread ${transcript.threadId}`);
              } catch (archiveError: any) {
                if (archiveError.code === 50083) {
                  // Thread was archived by another process between our check and action
                  log.debug(
                    `LearningService: Thread ${transcript.threadId} was archived by another process during close attempt`
                  );
                } else {
                  throw archiveError;
                }
              }
            } else {
              log.debug(
                `LearningService: Thread ${transcript.threadId} was already archived, skipping close`
              );
            }
          }
        } catch (error) {
          log.error(`LearningService: Error closing thread ${transcript.threadId}:`, error);
        }
      }, 10000); // 10 second delay to allow reading the completion message
    } catch (error) {
      log.error(`LearningService: Error in closeThreadAfterLearning:`, error);
    }
  }

  /**
   * Store transcript temporarily for processing
   */
  private async storeTranscriptTemporarily(transcript: ModmailThreadTranscript): Promise<void> {
    // This could use Redis or a temporary database collection
    // For now, we'll store in memory (in production, use Redis)
    // Implementation depends on your caching strategy
  }

  /**
   * Clean up temporary transcript storage
   */
  private async cleanupTemporaryTranscript(threadId: string): Promise<void> {
    // Clean up the temporarily stored transcript
    // Implementation depends on your storage strategy
  }
}
