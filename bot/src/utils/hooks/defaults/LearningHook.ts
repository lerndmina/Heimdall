import { BaseHook } from "../BaseHook";
import {
  HookType,
  HookPriority,
  AfterClosingHookContext,
  HookResult,
  HookContext,
} from "../HookTypes";
import { LearningService, ModmailThreadTranscript } from "../../../services/LearningService";
import { TextChannel } from "discord.js";
import log from "../../log";

/**
 * Hook that offers to learn from modmail threads after they are closed
 */
export class LearningHook extends BaseHook {
  private learningService: LearningService;

  constructor() {
    super(
      "learning",
      "AI Learning Hook",
      "Offers to learn from modmail conversations to improve AI responses",
      HookType.AFTER_CLOSING,
      HookPriority.LOW
    );

    this.learningService = new LearningService();

    // Add conditions for when this hook should run
    this.addCondition((context: HookContext): boolean => {
      if (context.hookType !== HookType.AFTER_CLOSING) return false;
      const afterContext = context as AfterClosingHookContext;
      const hasTranscript = !!(
        afterContext.transcript && afterContext.transcript.messages.length > 0
      );
      log.debug(`LearningHook condition - Has transcript with messages: ${hasTranscript}`, {
        hasTranscript: !!afterContext.transcript,
        messageCount: afterContext.transcript?.messages?.length || 0,
      });
      // Only run if we have transcript data - duration doesn't matter
      return hasTranscript;
    });
  }

  /**
   * Execute the learning hook
   */
  protected async executeHook(context: HookContext): Promise<HookResult> {
    const afterContext = context as AfterClosingHookContext;

    try {
      // Check if learning is enabled for this guild (you might want to add a config for this)
      if (!this.isLearningEnabledForGuild(afterContext.guild.id)) {
        return this.createSuccessResult({ learningSkipped: "disabled" });
      }

      // Check if we have a valid transcript
      if (!afterContext.transcript) {
        log.debug("No transcript available for learning", {
          guildId: afterContext.guild.id,
          threadId: afterContext.threadId,
        });
        return this.createSuccessResult({ learningSkipped: "no_transcript" });
      }

      // Find the staff channel to post the learning offer
      const staffChannel = await this.findStaffChannel(afterContext);
      if (!staffChannel) {
        log.debug("No staff channel found for learning offer", {
          guildId: afterContext.guild.id,
          categoryId: afterContext.categoryId,
        });
        return this.createSuccessResult({ learningSkipped: "no_staff_channel" });
      }

      // Create transcript object for learning service
      const transcript: ModmailThreadTranscript = {
        threadId: afterContext.threadId,
        guildId: afterContext.guild.id,
        categoryId: afterContext.categoryId,
        userId: afterContext.user.id,
        messages: afterContext.transcript.messages,
        closedAt: afterContext.transcript.closedAt,
        openedAt: afterContext.transcript.openedAt,
        duration: afterContext.transcript.duration,
      };

      // Reopen the thread temporarily for learning interaction
      log.debug(`LearningHook: Reopening thread ${afterContext.threadId} for learning interaction`);

      try {
        // Get the thread channel and reopen it
        const threadChannel = await afterContext.guild.channels.fetch(afterContext.threadId);
        if (threadChannel?.isThread()) {
          await threadChannel.setArchived(false);
          await threadChannel.setLocked(false);
          log.debug(`LearningHook: Successfully reopened thread ${afterContext.threadId}`);

          // Post learning prompt directly in the thread for staff interaction
          await this.learningService.offerLearningFromThread(
            afterContext.client,
            transcript,
            threadChannel
          );

          log.debug(`LearningHook: Learning prompt posted in thread ${afterContext.threadId}`);
        } else {
          log.warn(`LearningHook: Could not find or access thread ${afterContext.threadId}`);
          // Fallback to staff channel
          await this.learningService.offerLearningFromThread(
            afterContext.client,
            transcript,
            staffChannel
          );
        }
      } catch (error) {
        log.error(`LearningHook: Error reopening thread ${afterContext.threadId}:`, error);
        // Fallback to staff channel
        await this.learningService.offerLearningFromThread(
          afterContext.client,
          transcript,
          staffChannel
        );
      }

      // Return success - learning prompt has been posted, modmail is already closed
      return this.createSuccessResult({ learningPromptPosted: true });
    } catch (error) {
      log.error("Error in learning hook:", error);

      // Don't fail the hook - learning is optional
      return this.createSuccessResult({
        learningError: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Check if learning is enabled for a guild
   * This could be expanded to check a database config in the future
   */
  private isLearningEnabledForGuild(guildId: string): boolean {
    // For now, learning is enabled by default
    // You could add a database check here to allow guilds to opt out
    return true;
  }

  /**
   * Find the appropriate staff channel to post the learning offer
   */
  private async findStaffChannel(context: AfterClosingHookContext): Promise<TextChannel | null> {
    try {
      // Try to find the category channel first
      const categoryChannel = context.guild.channels.cache.get(context.categoryId);
      if (categoryChannel?.isTextBased() && categoryChannel instanceof TextChannel) {
        return categoryChannel;
      }

      // If category channel is not found or not accessible, look for a general staff channel
      // This could be configured per guild in the future
      const staffChannels = context.guild.channels.cache.filter(
        (channel) =>
          channel.isTextBased() &&
          channel instanceof TextChannel &&
          (channel.name.includes("staff") ||
            channel.name.includes("admin") ||
            channel.name.includes("mod"))
      );

      if (staffChannels.size > 0) {
        return staffChannels.first() as TextChannel;
      }

      return null;
    } catch (error) {
      log.error("Error finding staff channel:", error);
      return null;
    }
  }
}
