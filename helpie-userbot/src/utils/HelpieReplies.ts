/**
 * HelpieReplies - Universal message sending system with automatic emoji injection
 *
 * Provides consistent reply formatting across all Helpie commands with contextual
 * animated emoji based on reply type. All replies are sent as embeds.
 *
 * Available emoji:
 * - mandalorianhello (greeting/success)
 * - mandalorianshocked (user error/warning)
 * - mandalorianwhat (thinking/processing/question)
 * - mandaloriansorry (system error/apology)
 * - mandalorianlooking (searching/loading)
 */

import { ChatInputCommandInteraction, InteractionReplyOptions, InteractionUpdateOptions, MessagePayload, InteractionEditReplyOptions, Message, InteractionResponse, EmbedBuilder } from "discord.js";

/**
 * Track which interactions have been replied to
 */
const repliedInteractions = new WeakSet<ChatInputCommandInteraction>();

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
  static async send(interaction: ChatInputCommandInteraction, options: HelpieReplyOptions): Promise<InteractionResponse<boolean> | Message> {
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
  static async reply(interaction: ChatInputCommandInteraction, options: HelpieReplyOptions): Promise<InteractionResponse<boolean>> {
    const { type = "info", ephemeral = false, content, emoji = true } = options;

    // Mark as replied
    repliedInteractions.add(interaction);

    // Check if content is an object with title and message
    if (typeof content === "object" && "title" in content && "message" in content) {
      // Use embed for object content
      const embed = createEmbed(content.title, content.message, type, emoji);

      return interaction.reply({
        content: "", // Clear any loading symbols
        embeds: [embed],
        flags: ephemeral ? 64 : undefined,
      });
    } else {
      // Use plain text for string content
      const formattedContent = formatContent(content as string, type, emoji);

      return interaction.reply({
        content: formattedContent,
        flags: ephemeral ? 64 : undefined,
      });
    }
  }

  /**
   * Edit an existing reply (internal use - prefer send() for automatic behavior)
   * - String content: Plain text message with emoji prefix
   * - Object content: Embed with title and message
   */
  static async editReply(interaction: ChatInputCommandInteraction, options: HelpieReplyOptions): Promise<Message> {
    const { type = "info", content, emoji = true } = options;

    // Check if content is an object with title and message
    if (typeof content === "object" && "title" in content && "message" in content) {
      // Use embed for object content
      const embed = createEmbed(content.title, content.message, type, emoji);

      return interaction.editReply({
        content: "", // Clear any loading symbols
        embeds: [embed],
      });
    } else {
      // Use plain text for string content
      const formattedContent = formatContent(content as string, type, emoji);

      return interaction.editReply({
        content: formattedContent,
      });
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
  static async deferThinking(interaction: ChatInputCommandInteraction, ephemeral: boolean = false): Promise<InteractionResponse<boolean>> {
    repliedInteractions.add(interaction);
    return interaction.reply({
      content: HelpieEmoji.what,
      flags: ephemeral ? 64 : undefined, // MessageFlags.Ephemeral = 64
    });
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
  static async deferSearching(interaction: ChatInputCommandInteraction, ephemeral: boolean = false): Promise<InteractionResponse<boolean>> {
    repliedInteractions.add(interaction);
    return interaction.reply({
      content: HelpieEmoji.looking,
      flags: ephemeral ? 64 : undefined, // MessageFlags.Ephemeral = 64
    });
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
  static async success(interaction: ChatInputCommandInteraction, content: ReplyContent, ephemeral: boolean = false): Promise<InteractionResponse<boolean> | Message> {
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
  static async error(interaction: ChatInputCommandInteraction, content: ReplyContent, ephemeral: boolean = true): Promise<InteractionResponse<boolean> | Message> {
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
  static async warning(interaction: ChatInputCommandInteraction, content: ReplyContent, ephemeral: boolean = true): Promise<InteractionResponse<boolean> | Message> {
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
  static async info(interaction: ChatInputCommandInteraction, content: ReplyContent, ephemeral: boolean = false): Promise<InteractionResponse<boolean> | Message> {
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
  static async editSuccess(interaction: ChatInputCommandInteraction, content: ReplyContent): Promise<Message> {
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
  static async editError(interaction: ChatInputCommandInteraction, content: ReplyContent): Promise<Message> {
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
  static async editWarning(interaction: ChatInputCommandInteraction, content: ReplyContent): Promise<Message> {
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
  static async editInfo(interaction: ChatInputCommandInteraction, content: ReplyContent): Promise<Message> {
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
}

/**
 * Convenience exports for direct emoji access
 */
export { HelpieEmoji as Emoji };

/**
 * Default export
 */
export default HelpieReplies;
