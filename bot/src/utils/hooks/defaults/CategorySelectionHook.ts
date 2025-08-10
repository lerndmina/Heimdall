import { BaseHook } from "../BaseHook";
import {
  HookType,
  HookPriority,
  HookContext,
  HookResult,
  BeforeCreationHookContext,
} from "../HookTypes";
import { ModmailCategoryFlow, CategorySelectionContext } from "../../modmail/ModmailCategoryFlow";
import { ThingGetter } from "../../TinyUtils";
import { waitingEmoji } from "../../../Bot";
import Database from "../../data/database";
import ModmailConfig from "../../../models/ModmailConfig";
import log from "../../log";
import { InteractionResponse } from "discord.js";

/**
 * Category selection hook for modmail creation
 * Handles category selection and form collection for modmail threads
 */
export class CategorySelectionHook extends BaseHook {
  constructor() {
    super(
      "category-selection",
      "Category Selection",
      "Handles category selection and form collection for modmail threads",
      HookType.BEFORE_CREATION,
      HookPriority.NORMAL
    );

    // Execute when we have a selected guild but no category selected yet
    this.addCondition((context) => {
      const creationContext = context as BeforeCreationHookContext;
      return !!creationContext.selectedGuildId && !creationContext.selectedCategoryId;
    });
  }

  protected async executeHook(context: HookContext): Promise<HookResult> {
    const creationContext = context as BeforeCreationHookContext;
    const { client, user, guild, originalMessage, messageContent, selectedGuildId } =
      creationContext;

    log.debug(`CategorySelectionHook: Starting category selection for guild ${selectedGuildId}`);

    try {
      // Get the target guild - might be different from the current guild context
      const getter = new ThingGetter(client);
      const targetGuild = selectedGuildId ? await getter.getGuild(selectedGuildId) : guild;

      if (!targetGuild) {
        return this.createErrorResult(
          "Target guild not found",
          "The selected server is no longer available."
        );
      }

      // Verify user is member of target guild
      const member = await getter.getMember(targetGuild, user.id);
      if (!member) {
        return this.createErrorResult(
          "User not member of target guild",
          `You are not a member of ${targetGuild.name}.`
        );
      }

      // Get modmail config for the target guild
      const db = new Database();
      const config = await db.findOne(ModmailConfig, { guildId: targetGuild.id });
      if (!config) {
        return this.createErrorResult(
          "Modmail config not found",
          "Modmail is not configured for this server."
        );
      }

      // Create category selection flow
      const categoryFlow = new ModmailCategoryFlow();

      // Create reply interface - this might need to be adapted based on how the message was sent
      const replyInterface = await this.createReplyInterface(originalMessage, creationContext);

      const categorySelectionContext: CategorySelectionContext = {
        client,
        user,
        guild: targetGuild,
        originalMessage,
        initialMessage: messageContent,
        reply: replyInterface,
      };

      // Execute category selection
      const categoryResult = await categoryFlow.startCategorySelection(categorySelectionContext);

      if (!categoryResult.success) {
        log.error(`CategorySelectionHook: Category selection failed - ${categoryResult.error}`);
        return this.createErrorResult(
          categoryResult.error || "Category selection failed",
          "Failed to select category. Please try again."
        );
      }

      log.debug(`CategorySelectionHook: Category selection successful`, {
        categoryId: categoryResult.categoryId,
        hasFormResponses: !!categoryResult.formResponses,
        hasMetadata: !!categoryResult.metadata,
      });

      // Return category selection results
      return this.createSuccessResult({
        selectedCategoryId: categoryResult.categoryId,
        formResponses: categoryResult.formResponses,
        formMetadata: categoryResult.metadata,
        targetGuild: targetGuild,
        modmailConfig: config,
      });
    } catch (error) {
      log.error("CategorySelectionHook: Unexpected error:", error);
      return this.createErrorResult(
        error instanceof Error ? error.message : "Unknown error",
        "An error occurred while selecting the category. Please try again."
      );
    }
  }

  /**
   * Create a reply interface for the category selection flow
   * This adapts the message/interaction to work with ModmailCategoryFlow
   */
  private async createReplyInterface(
    originalMessage: any,
    context: BeforeCreationHookContext
  ): Promise<InteractionResponse> {
    // Check if we have an interaction from server selection
    const serverSelectionData = context as any;
    if (serverSelectionData.interaction) {
      // We have an interaction from server selection, use its editReply method
      const interaction = serverSelectionData.interaction;

      return {
        edit: (options: any) => interaction.editReply(options),
        createMessageComponentCollector: (options: any) => {
          const message = interaction.message;
          if (!message) throw new Error("No message found on interaction");
          return message.createMessageComponentCollector(options);
        },
      } as InteractionResponse;
    } else {
      // Use shared bot message if available, otherwise create a new one
      let botMessage = context.sharedBotMessage;

      console.log("CategorySelectionHook Debug:", {
        hasSharedBotMessage: !!botMessage,
        sharedMessageId: botMessage?.id,
        sharedMessageUrl: botMessage?.url,
        contextKeys: Object.keys(context),
      });

      if (!botMessage) {
        console.error(
          "CategorySelectionHook: No shared bot message available! This should not happen."
        );
        console.error("Context:", {
          user: context.user.tag,
          guild: context.guild.name,
          requestId: context.requestId,
          hasOriginalMessage: !!context.originalMessage,
        });

        // This is the problem - we're creating a NEW message instead of using the shared one
        throw new Error("Shared bot message not available in CategorySelectionHook");
      }

      return {
        edit: (options: any) => botMessage!.edit(options),
        createMessageComponentCollector: (options: any) => {
          return botMessage!.createMessageComponentCollector(options);
        },
      } as InteractionResponse;
    }
  }
}
