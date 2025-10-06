/**
 * HelpieReplies - Universal message sending system with automatic emoji injection
 *
 * Provides consistent reply formatting across all Helpie commands with contextual
 * animated emoji based on reply type. All replies are sent      const textContentWithoutPrelude = textContent.replace(preludePattern, "");

      // Create codeblock version
      const codeblockVersion = `\n\nHelpie was unable to send the message, copy here:\n\`\`\`\n${textContentWithoutPrelude}\n\`\`\``;

      // Check if we have character space (Discord limit is 2000)beds.
 *
 * Available emoji:
 * - mandalorianhello (greeting/success)
 * - mandalorianshocked (user error/warning)
 * - mandalorianwhat (thinking/processing/question)
 * - mandaloriansorry (system error/apology)
 * - mandalorianlooking (searching/loading)
 */

import {
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  InteractionReplyOptions,
  InteractionUpdateOptions,
  MessagePayload,
  InteractionEditReplyOptions,
  Message,
  InteractionResponse,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from "discord.js";
import log from "./log";
import { prelude } from "./AskHelpie";

/**
 * Custom error for when a user deletes their message while the bot is processing
 * This allows commands to gracefully halt execution when the interaction is no longer valid
 */
export class InteractionDeletedError extends Error {
  constructor(message: string = "User deleted the message while bot was processing") {
    super(message);
    this.name = "InteractionDeletedError";
    Object.setPrototypeOf(this, InteractionDeletedError.prototype);
  }
}

/**
 * Supported interaction types for HelpieReplies
 * Includes modal submissions for commands that use modals
 */
export type SupportedInteraction = ChatInputCommandInteraction | MessageContextMenuCommandInteraction | ModalSubmitInteraction;

/**
 * Track which interactions have been replied to
 */
const repliedInteractions = new WeakSet<SupportedInteraction>();

/**
 * Track which interactions were intentionally made ephemeral
 */
const intentionalEphemeralInteractions = new WeakSet<SupportedInteraction>();

/**
 * Track the actual message content that was sent (before Discord's response)
 * Maps interaction -> sent content for ephemeral reconstruction
 */
const sentMessageContent = new WeakMap<SupportedInteraction, string>();

/**
 * Track interaction IDs for mobile button functionality
 * Maps interaction -> interaction ID for button custom ID
 */
const interactionIds = new WeakMap<SupportedInteraction, string>();

/**
 * Animated emoji IDs for Helpie
 */
export const HelpieEmoji = {
  hello: "<a:mandalorianhello:1422976992047005887>",
  shocked: "<a:mandalorianshocked:1422976972685836308>",
  what: "<a:mandalorianwhat:1422976946962174003>",
  sorry: "<a:mandaloriansorry:1422976872324792371>",
  looking: "<a:mandalorianlooking:1422976818448699432>",
} as const;

/**
 * Reply types determine which emoji is used
 */
export type ReplyType = "success" | "error" | "warning" | "info" | "thinking" | "searching" | "question";

/**
 * Content input - can be a simple string or object with title and message
 */
export type ReplyContent = string | { title: string; message: string };

/**
 * Options for HelpieReplies
 */
export interface HelpieReplyOptions {
  type?: ReplyType;
  ephemeral?: boolean;
  content: ReplyContent;
  emoji?: boolean; // Whether to include emoji in title (default: true)
}

/**
 * Maps reply types to appropriate emoji
 */
function getEmojiForType(type: ReplyType): string {
  switch (type) {
    case "success":
      return HelpieEmoji.hello;
    case "error":
      return HelpieEmoji.sorry;
    case "warning":
      return HelpieEmoji.shocked;
    case "thinking":
    case "question":
      return HelpieEmoji.what;
    case "searching":
      return HelpieEmoji.looking;
    case "info":
    default:
      return HelpieEmoji.what;
  }
}

/**
 * Gets default title for reply type
 */
function getDefaultTitle(type: ReplyType): string {
  switch (type) {
    case "success":
      return "Success";
    case "error":
      return "Error";
    case "warning":
      return "Warning";
    case "info":
      return "Information";
    case "thinking":
    case "question":
      return "Processing";
    case "searching":
      return "Searching";
    default:
      return "Helpie";
  }
}

/**
 * Gets embed color for reply type
 */
function getColorForType(type: ReplyType): number {
  switch (type) {
    case "success":
      return 0x43b581; // Green
    case "error":
      return 0xf04747; // Red
    case "warning":
      return 0xfaa61a; // Yellow/Orange
    case "info":
    case "thinking":
    case "question":
    case "searching":
    default:
      return 0x7289da; // Blurple
  }
}

/**
 * Creates an embed with formatted content (only for objects with title and message)
 */
function createEmbed(title: string, message: string, type: ReplyType = "info", includeEmoji: boolean = true): EmbedBuilder {
  const emoji = getEmojiForType(type);

  // Add emoji to title if enabled
  const finalTitle = includeEmoji ? `${emoji} ${title}` : title;

  return new EmbedBuilder().setTitle(finalTitle).setDescription(message).setColor(getColorForType(type)).setTimestamp();
}

/**
 * Formats content with appropriate emoji prefix for plain text
 */
function formatContent(content: string, type: ReplyType = "info", includeEmoji: boolean = true): string {
  if (!includeEmoji) {
    return content;
  }

  const emoji = getEmojiForType(type);
  // Check if content starts with markdown header and preserve it
  const headerMatch = content.match(/^(#{1,6}\s)/);
  if (headerMatch) {
    const header = headerMatch[1];
    const contentWithoutHeader = content.slice(header.length);
    return `${header} ${emoji} ${contentWithoutHeader}`;
  }
  return `${emoji} ${content}`;
}

/**
 * HelpieReplies - Universal reply system for Helpie bot
 *
 * Provides consistent message formatting with contextual animated emoji
 * Automatically tracks interactions and uses reply() or editReply() as needed
 */
export class HelpieReplies {
  /**
   * Reconstructs an ephemeral message for forced ephemeral replies
   * Returns the actual sent message content from WeakMap as-is
   */
  private static reconstructEphemeralMessage(interaction: SupportedInteraction): string {
    // Get the actual message content that was sent
    const sentContent = sentMessageContent.get(interaction);

    if (!sentContent) {
      // Fallback - shouldn't happen, but handle gracefully
      log.error("reconstructEphemeralMessage called but no sent content found in WeakMap");
      return "Helpie was unable to send the message.";
    }

    // Return the content as-is (prelude already included by caller if present)
    return sentContent;
  }

  /**
   * Creates a button for mobile users to get raw content
   * Button custom ID contains the interaction ID for lookup
   */
  private static createMobileButton(interaction: SupportedInteraction): ActionRowBuilder<ButtonBuilder> {
    // Store the interaction ID for later lookup
    interactionIds.set(interaction, interaction.id);

    const customId = `ephemeral-mobile:${interaction.id}`;
    log.debug("Creating mobile button with custom ID:", customId);

    const button = new ButtonBuilder().setCustomId(customId).setLabel("📱 I'm on Mobile").setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    log.debug("Mobile button created successfully");

    return actionRow;
  }

  /**
   * Handles mobile button clicks - converts codeblock format to raw text
   * Called from external button handler
   */
  static async handleMobileButton(buttonInteraction: ButtonInteraction): Promise<void> {
    try {
      // Extract the original interaction ID from the button custom ID
      const customId = buttonInteraction.customId;
      const interactionId = customId.replace("ephemeral-mobile:", "");

      log.debug("Mobile button clicked for interaction:", interactionId);

      // Get the content from the message itself (it's already there)
      const message = buttonInteraction.message;
      const currentContent = message.content;

      log.debug("Current message content:", currentContent);
      log.debug("Content length:", currentContent.length);

      // Extract content from codeblock - try multiple patterns
      // Pattern 1: Standard codeblock with newlines
      let codeblockMatch = currentContent.match(/```\n([\s\S]*?)\n```/);

      // Pattern 2: Codeblock without newlines before/after
      if (!codeblockMatch) {
        codeblockMatch = currentContent.match(/```([\s\S]*?)```/);
      }

      if (!codeblockMatch) {
        log.error("No codeblock found in message. Content:", currentContent);
        await buttonInteraction.reply({
          content: "❌ Unable to extract content from codeblock. The message format may have changed. Please copy manually by long-pressing the message.",
          flags: 64, // Ephemeral
        });
        return;
      }

      const rawContent = codeblockMatch[1].trim();

      log.debug("Extracted raw content:", rawContent);
      log.debug("Extracted content length:", rawContent.length);

      if (!rawContent || rawContent.length === 0) {
        await buttonInteraction.reply({
          content: "❌ Extracted content is empty. Please copy manually.",
          flags: 64, // Ephemeral
        });
        return;
      }

      // Update the message with just the raw content
      await buttonInteraction.update({
        content: rawContent,
        components: [], // Remove the button
      });

      log.info("Successfully converted message to mobile-friendly format");
    } catch (error: any) {
      log.error("Failed to handle mobile button:", error);
      log.error("Error details:", {
        message: error.message,
        stack: error.stack,
        code: error.code,
      });

      // Try to respond to the interaction if we haven't already
      try {
        if (!buttonInteraction.replied && !buttonInteraction.deferred) {
          await buttonInteraction.reply({
            content: "❌ An error occurred while processing your request. Please try copying manually.",
            flags: 64, // Ephemeral
          });
        }
      } catch (replyError) {
        // Silently fail if we can't reply
        log.error("Failed to send error message:", replyError);
      }
    }
  }

  /**
   * Handles forced ephemeral replies by Discord (userbot in large servers)
   * Reconstructs message when Discord forces ephemeral flag
   */
  private static async handleForcedEphemeral(interaction: SupportedInteraction, response: InteractionResponse<boolean>, intentionalEphemeral: boolean): Promise<void> {
    // If we intentionally made it ephemeral, don't modify
    if (intentionalEphemeral) return;

    try {
      // Fetch the actual message to check if it was forced ephemeral
      const message = await response.fetch();

      // Check if message has ephemeral flag (64)
      const isEphemeral = (message.flags.bitfield & 64) === 64;

      log.debug("handleForcedEphemeral - Is ephemeral:", isEphemeral);

      if (!isEphemeral) return; // Not forced ephemeral, we're good

      // Reconstruct and update the message
      const reconstructed = HelpieReplies.reconstructEphemeralMessage(interaction);

      // Check if content already has prelude (AI responses)
      const hasPrelude = reconstructed.startsWith(prelude); // Check for prelude

      // Build message: if has prelude, show prelude + codeblock. Otherwise just codeblock.
      const reconstructedWithMessage = hasPrelude
        ? `${prelude}Helpie was unable to send the message, copy here:\n\`\`\`\n${reconstructed}\n\`\`\``
        : `Helpie was unable to send the message, copy here:\n\`\`\`\n${reconstructed}\n\`\`\``;

      log.debug("Reconstructed message length:", reconstructedWithMessage.length);
      log.debug("Has prelude:", hasPrelude);

      // Create mobile button
      const mobileButton = HelpieReplies.createMobileButton(interaction);

      log.debug("Adding mobile button to forced ephemeral message");

      await interaction.editReply({
        content: reconstructedWithMessage,
        embeds: [], // Clear embeds
        components: [mobileButton],
      });

      log.info("Forced ephemeral message updated with mobile button");
    } catch (error: any) {
      // Handle deleted message - silently ignore since this is just an enhancement
      if (error.code === 10008) {
        return; // User deleted message, nothing we can do
      }
      // Silently fail for other errors - don't break the command if this enhancement fails
      log.error("Failed to handle forced ephemeral:", error);
    }
  }

  /**
   * Handles ephemeral messages in editReply
   * Reconstructs message when ephemeral flag is detected
   */
  private static async handleEphemeralEditReply(interaction: SupportedInteraction, message: Message): Promise<void> {
    try {
      // Check if message has ephemeral flag (64)
      const isEphemeral = (message.flags.bitfield & 64) === 64;

      log.debug("handleEphemeralEditReply - Is ephemeral:", isEphemeral);

      if (!isEphemeral) return; // Not ephemeral, we're good

      // Check if this was intentionally made ephemeral
      const wasIntentionallyEphemeral = intentionalEphemeralInteractions.has(interaction);

      log.debug("handleEphemeralEditReply - Was intentionally ephemeral:", wasIntentionallyEphemeral);

      if (wasIntentionallyEphemeral) return; // Intentionally ephemeral, don't modify

      // Reconstruct and update the message
      const reconstructed = HelpieReplies.reconstructEphemeralMessage(interaction);

      // Check if content already has prelude (AI responses)
      const hasPrelude = reconstructed.startsWith("# Hey there! I'm Helpie");

      // Build message: if has prelude, show prelude + codeblock. Otherwise just codeblock.
      const reconstructedWithMessage = hasPrelude
        ? `${prelude}Helpie was unable to send the message, copy here:\n\`\`\`\n${reconstructed}\n\`\`\``
        : `Helpie was unable to send the message, copy here:\n\`\`\`\n${reconstructed}\n\`\`\``;

      log.debug("Reconstructed message length (editReply):", reconstructedWithMessage.length);
      log.debug("Has prelude:", hasPrelude);

      // Create mobile button
      const mobileButton = HelpieReplies.createMobileButton(interaction);

      log.debug("Adding mobile button to ephemeral edit reply");

      await interaction.editReply({
        content: reconstructedWithMessage,
        embeds: [], // Clear embeds
        components: [mobileButton],
      });

      log.info("Ephemeral edit reply updated with mobile button");
    } catch (error: any) {
      // Handle deleted message - silently ignore since this is just an enhancement
      if (error.code === 10008) {
        return; // User deleted message, nothing we can do
      }
      // Silently fail for other errors - don't break the command if this enhancement fails
      log.error("Failed to handle ephemeral edit reply:", error);
    }
  }

  /**
   * Smart send - automatically uses reply() or editReply() based on interaction state
   * Tracks interactions to know if they've been replied to
   *
   * @example
   * // First call uses reply()
   * await HelpieReplies.send(interaction, {
   *   type: 'success',
   *   content: 'Context updated successfully!'
   * });
   *
   * // Second call automatically uses editReply()
   * await HelpieReplies.send(interaction, {
   *   type: 'success',
   *   content: { title: 'Context Saved', message: 'Done!' }
   * });
   */
  static async send(interaction: SupportedInteraction, options: HelpieReplyOptions): Promise<InteractionResponse<boolean> | Message> {
    // Check if we've already replied to this interaction
    if (repliedInteractions.has(interaction)) {
      // Use editReply for subsequent calls
      return HelpieReplies.editReply(interaction, options);
    } else {
      // Use reply for first call and mark as replied
      repliedInteractions.add(interaction);
      return HelpieReplies.reply(interaction, options);
    }
  }

  /**
   * Reply to an interaction (internal use - prefer send() for automatic behavior)
   * - String content: Plain text message with emoji prefix
   * - Object content: Embed with title and message
   */
  static async reply(interaction: SupportedInteraction, options: HelpieReplyOptions): Promise<InteractionResponse<boolean>> {
    const { type = "info", ephemeral = false, content, emoji = true } = options;

    log.debug("=== REPLY DEBUG ===");
    log.debug("reply() called with ephemeral:", ephemeral);
    log.debug("reply() called with type:", type);
    log.debug("===================");

    // Mark as replied
    repliedInteractions.add(interaction);

    // Track if this was intentionally ephemeral
    if (ephemeral) {
      intentionalEphemeralInteractions.add(interaction);
    }

    try {
      // Check if content is an object with title and message
      if (typeof content === "object" && "title" in content && "message" in content) {
        // Use embed for object content
        const embed = createEmbed(content.title, content.message, type, emoji);

        // Store the actual message content (embed description) for ephemeral reconstruction
        sentMessageContent.set(interaction, content.message);

        const response = await interaction.reply({
          content: "", // Clear any loading symbols
          embeds: [embed],
          flags: ephemeral ? 64 : undefined,
        });

        log.debug("Reply response received, calling handleForcedEphemeral...");

        // Check if reply was forced ephemeral by Discord (userbot in large server)
        await HelpieReplies.handleForcedEphemeral(interaction, response, ephemeral);

        return response;
      } else {
        // Use plain text for string content
        const formattedContent = formatContent(content as string, type, emoji);

        // Store the actual formatted content for ephemeral reconstruction
        sentMessageContent.set(interaction, formattedContent);

        const response = await interaction.reply({
          content: formattedContent,
          flags: ephemeral ? 64 : undefined,
        });

        log.debug("Reply response received, calling handleForcedEphemeral...");

        // Check if reply was forced ephemeral by Discord (userbot in large server)
        await HelpieReplies.handleForcedEphemeral(interaction, response, ephemeral);

        return response;
      }
    } catch (error: any) {
      // Handle deleted message (user deleted message while bot was processing)
      if (error.code === 10008) {
        // Unknown Message - interaction was deleted, halt command flow
        throw new InteractionDeletedError("User deleted the message while bot was processing");
      }
      // Re-throw other errors
      throw error;
    }
  }
  /**
   * Edit an existing reply (internal use - prefer send() for automatic behavior)
   * - String content: Plain text message with emoji prefix
   * - Object content: Embed with title and message
   */
  static async editReply(interaction: SupportedInteraction, options: HelpieReplyOptions): Promise<Message> {
    const { type = "info", content, emoji = true } = options;

    log.debug("=== EDIT REPLY DEBUG ===");
    log.debug("editReply() called with type:", type);
    log.debug("========================");

    try {
      // Check if content is an object with title and message
      if (typeof content === "object" && "title" in content && "message" in content) {
        // Use embed for object content
        const embed = createEmbed(content.title, content.message, type, emoji);

        // Store the actual message content (embed description) for ephemeral reconstruction
        sentMessageContent.set(interaction, content.message);

        const message = await interaction.editReply({
          content: "", // Clear any loading symbols
          embeds: [embed],
        });

        log.debug("Edit reply message received:");
        log.debug("Message flags:", message.flags);
        log.debug("Message flags.bitfield:", message.flags.bitfield);
        log.debug("Message flags as array:", message.flags.toArray());

        // Check if message is ephemeral and reconstruct if needed
        await HelpieReplies.handleEphemeralEditReply(interaction, message);

        return message;
      } else {
        // Use plain text for string content
        const formattedContent = formatContent(content as string, type, emoji);

        // Store the actual formatted content for ephemeral reconstruction
        sentMessageContent.set(interaction, formattedContent);

        const message = await interaction.editReply({
          content: formattedContent,
        });

        log.debug("Edit reply message received:");
        log.debug("Message flags:", message.flags);
        log.debug("Message flags.bitfield:", message.flags.bitfield);
        log.debug("Message flags as array:", message.flags.toArray());

        // Check if message is ephemeral and reconstruct if needed
        await HelpieReplies.handleEphemeralEditReply(interaction, message);

        return message;
      }
    } catch (error: any) {
      // Handle deleted message (user deleted message while bot was processing)
      if (error.code === 10008) {
        // Unknown Message - interaction was deleted, halt command flow
        throw new InteractionDeletedError("User deleted the message while bot was processing");
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Defer reply with thinking emoji (for long operations)
   * Marks interaction as replied, so subsequent calls use editReply automatically
   *
   * @example
   * await HelpieReplies.deferThinking(interaction);
   * // ... do work ...
   * await HelpieReplies.success(interaction, 'Done!'); // Automatically uses editReply
   */
  static async deferThinking(interaction: SupportedInteraction, ephemeral: boolean = false): Promise<InteractionResponse<boolean>> {
    repliedInteractions.add(interaction);

    // Track if this was intentionally ephemeral
    if (ephemeral) {
      intentionalEphemeralInteractions.add(interaction);
    }

    try {
      return await interaction.reply({
        content: HelpieEmoji.what,
        flags: ephemeral ? 64 : undefined, // MessageFlags.Ephemeral = 64
      });
    } catch (error: any) {
      // Handle deleted message (user deleted message while bot was processing)
      if (error.code === 10008) {
        throw new InteractionDeletedError("User deleted the message while bot was processing");
      }
      throw error;
    }
  }

  /**
   * Defer reply with searching/loading emoji (for lookup operations or loading states)
   * Marks interaction as replied, so subsequent calls use editReply automatically
   *
   * @example
   * await HelpieReplies.deferSearching(interaction);
   * // ... search database or load data ...
   * await HelpieReplies.info(interaction, 'Results...'); // Automatically uses editReply
   */
  static async deferSearching(interaction: SupportedInteraction, ephemeral: boolean = false): Promise<InteractionResponse<boolean>> {
    repliedInteractions.add(interaction);

    // Track if this was intentionally ephemeral
    if (ephemeral) {
      intentionalEphemeralInteractions.add(interaction);
    }

    try {
      return await interaction.reply({
        content: HelpieEmoji.looking,
        flags: ephemeral ? 64 : undefined, // MessageFlags.Ephemeral = 64
      });
    } catch (error: any) {
      // Handle deleted message (user deleted message while bot was processing)
      if (error.code === 10008) {
        throw new InteractionDeletedError("User deleted the message while bot was processing");
      }
      throw error;
    }
  }

  /**
   * Send a success message (automatically uses reply or edit)
   *
   * @example
   * await HelpieReplies.success(interaction, 'Context saved successfully!');
   *
   * @example
   * await HelpieReplies.success(interaction, { title: 'Saved', message: 'Context saved!' });
   */
  static async success(interaction: SupportedInteraction, content: ReplyContent, ephemeral: boolean = false): Promise<InteractionResponse<boolean> | Message> {
    return HelpieReplies.send(interaction, {
      type: "success",
      content,
      ephemeral,
    });
  }

  /**
   * Send an error message (system error, not user's fault) (automatically uses reply or edit)
   *
   * @example
   * await HelpieReplies.error(interaction, 'Failed to connect to database.');
   */
  static async error(interaction: SupportedInteraction, content: ReplyContent, ephemeral: boolean = true): Promise<InteractionResponse<boolean> | Message> {
    return HelpieReplies.send(interaction, {
      type: "error",
      content,
      ephemeral,
    });
  }

  /**
   * Send a warning message (user error or validation failure) (automatically uses reply or edit)
   *
   * @example
   * await HelpieReplies.warning(interaction, 'Invalid URL format!');
   */
  static async warning(interaction: SupportedInteraction, content: ReplyContent, ephemeral: boolean = true): Promise<InteractionResponse<boolean> | Message> {
    return HelpieReplies.send(interaction, {
      type: "warning",
      content,
      ephemeral,
    });
  }

  /**
   * Send an info message (automatically uses reply or edit)
   *
   * @example
   * await HelpieReplies.info(interaction, 'Here are the available contexts...');
   */
  static async info(interaction: SupportedInteraction, content: ReplyContent, ephemeral: boolean = false): Promise<InteractionResponse<boolean> | Message> {
    return HelpieReplies.send(interaction, {
      type: "info",
      content,
      ephemeral,
    });
  }

  /**
   * Edit reply to success message
   *
   * @example
   * await HelpieReplies.deferThinking(interaction);
   * // ... do work ...
   * await HelpieReplies.editSuccess(interaction, 'All done!');
   */
  static async editSuccess(interaction: SupportedInteraction, content: ReplyContent): Promise<Message> {
    return HelpieReplies.editReply(interaction, {
      type: "success",
      content,
    });
  }

  /**
   * Edit reply to error message
   *
   * @example
   * await HelpieReplies.deferThinking(interaction);
   * // ... operation fails ...
   * await HelpieReplies.editError(interaction, 'Something went wrong.');
   */
  static async editError(interaction: SupportedInteraction, content: ReplyContent): Promise<Message> {
    return HelpieReplies.editReply(interaction, {
      type: "error",
      content,
    });
  }

  /**
   * Edit reply to warning message
   *
   * @example
   * await HelpieReplies.deferSearching(interaction);
   * // ... validation fails ...
   * await HelpieReplies.editWarning(interaction, 'Invalid input detected!');
   */
  static async editWarning(interaction: SupportedInteraction, content: ReplyContent): Promise<Message> {
    return HelpieReplies.editReply(interaction, {
      type: "warning",
      content,
    });
  }

  /**
   * Edit reply to info message
   *
   * @example
   * await HelpieReplies.deferSearching(interaction);
   * // ... fetch results ...
   * await HelpieReplies.editInfo(interaction, 'Found 5 contexts.');
   */
  static async editInfo(interaction: SupportedInteraction, content: ReplyContent): Promise<Message> {
    return HelpieReplies.editReply(interaction, {
      type: "info",
      content,
    });
  }

  /**
   * Get just the emoji for a reply type (for custom formatting)
   *
   * @example
   * const emoji = HelpieReplies.getEmoji('success');
   * await interaction.reply(`${emoji} Custom message with **formatting**`);
   */
  static getEmoji(type: ReplyType): string {
    return getEmojiForType(type);
  }

  /**
   * Edit reply with custom embed (for when you need full control over the embed)
   * Use this when you need custom colors, fields, footers, etc. that don't fit the standard patterns
   *
   * @example
   * const embed = new EmbedBuilder()
   *   .setTitle('🌐 Translation')
   *   .setColor(0x00d4aa)
   *   .addFields({ name: 'Original', value: 'Hola' })
   *   .setFooter({ text: 'Powered by DeepL' });
   * await HelpieReplies.editCustomEmbed(interaction, embed);
   */
  static async editCustomEmbed(interaction: SupportedInteraction, embed: EmbedBuilder): Promise<Message> {
    try {
      return await interaction.editReply({
        content: "", // Clear any loading symbols
        embeds: [embed],
      });
    } catch (error: any) {
      // Handle deleted message (user deleted message while bot was processing)
      if (error.code === 10008) {
        throw new InteractionDeletedError("User deleted the message while bot was processing");
      }
      throw error;
    }
  }
}

/**
 * Convenience exports for direct emoji access
 */
export { HelpieEmoji as Emoji };

/**
 * Default export
 */
export default HelpieReplies;
