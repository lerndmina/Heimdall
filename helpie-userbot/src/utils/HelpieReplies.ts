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
 * Creates an embed with formatted content
 */
function createEmbed(content: ReplyContent, type: ReplyType = "info", includeEmoji: boolean = true): EmbedBuilder {
  const emoji = getEmojiForType(type);
  let title: string;
  let description: string;

  // Handle content input
  if (typeof content === "string") {
    // Simple string - use default title
    title = getDefaultTitle(type);
    description = content;
  } else {
    // Object with custom title and message
    title = content.title;
    description = content.message;
  }

  // Add emoji to title if enabled
  const finalTitle = includeEmoji ? `${emoji} ${title}` : title;

  return new EmbedBuilder().setTitle(finalTitle).setDescription(description).setColor(getColorForType(type)).setTimestamp();
}

/**
 * HelpieReplies - Universal reply system for Helpie bot
 *
 * Provides consistent message formatting with contextual animated emoji
 */
export class HelpieReplies {
  /**
   * Reply to an interaction with formatted embed
   *
   * @example
   * await HelpieReplies.reply(interaction, {
   *   type: 'success',
   *   content: 'Context updated successfully!'
   * });
   *
   * @example
   * await HelpieReplies.reply(interaction, {
   *   type: 'success',
   *   content: { title: 'Context Saved', message: 'Your context has been saved!' }
   * });
   */
  static async reply(interaction: ChatInputCommandInteraction, options: HelpieReplyOptions): Promise<InteractionResponse<boolean>> {
    const { type = "info", ephemeral = false, content, emoji = true } = options;

    const embed = createEmbed(content, type, emoji);

    return interaction.reply({
      content: "", // Clear any loading symbols
      embeds: [embed],
      flags: ephemeral ? 64 : undefined,
    });
  }

  /**
   * Edit an existing reply with formatted embed
   *
   * @example
   * await HelpieReplies.editReply(interaction, {
   *   type: 'success',
   *   content: 'Operation completed!'
   * });
   *
   * @example
   * await HelpieReplies.editReply(interaction, {
   *   type: 'error',
   *   content: { title: 'Failed', message: 'Operation could not be completed.' }
   * });
   */
  static async editReply(interaction: ChatInputCommandInteraction, options: HelpieReplyOptions): Promise<Message> {
    const { type = "info", content, emoji = true } = options;

    const embed = createEmbed(content, type, emoji);

    return interaction.editReply({
      content: "", // Clear any loading symbols
      embeds: [embed],
    });
  }

  /**
   * Defer reply with thinking emoji (for long operations)
   *
   * @example
   * await HelpieReplies.deferThinking(interaction);
   * // ... do work ...
   * await HelpieReplies.editReply(interaction, { type: 'success', content: 'Done!' });
   */
  static async deferThinking(interaction: ChatInputCommandInteraction, ephemeral: boolean = false): Promise<InteractionResponse<boolean>> {
    return interaction.reply({
      content: HelpieEmoji.what,
      flags: ephemeral ? 64 : undefined, // MessageFlags.Ephemeral = 64
    });
  }

  /**
   * Defer reply with searching/loading emoji (for lookup operations or loading states)
   *
   * @example
   * await HelpieReplies.deferSearching(interaction);
   * // ... search database or load data ...
   * await HelpieReplies.editReply(interaction, { type: 'info', content: 'Results...' });
   */
  static async deferSearching(interaction: ChatInputCommandInteraction, ephemeral: boolean = false): Promise<InteractionResponse<boolean>> {
    return interaction.reply({
      content: HelpieEmoji.looking,
      flags: ephemeral ? 64 : undefined, // MessageFlags.Ephemeral = 64
    });
  }

  /**
   * Send a success message
   *
   * @example
   * await HelpieReplies.success(interaction, 'Context saved successfully!');
   *
   * @example
   * await HelpieReplies.success(interaction, { title: 'Saved', message: 'Context saved!' });
   */
  static async success(interaction: ChatInputCommandInteraction, content: ReplyContent, ephemeral: boolean = false): Promise<InteractionResponse<boolean>> {
    return HelpieReplies.reply(interaction, {
      type: "success",
      content,
      ephemeral,
    });
  }

  /**
   * Send an error message (system error, not user's fault)
   *
   * @example
   * await HelpieReplies.error(interaction, 'Failed to connect to database.');
   */
  static async error(interaction: ChatInputCommandInteraction, content: ReplyContent, ephemeral: boolean = true): Promise<InteractionResponse<boolean>> {
    return HelpieReplies.reply(interaction, {
      type: "error",
      content,
      ephemeral,
    });
  }

  /**
   * Send a warning message (user error or validation failure)
   *
   * @example
   * await HelpieReplies.warning(interaction, 'Invalid URL format!');
   */
  static async warning(interaction: ChatInputCommandInteraction, content: ReplyContent, ephemeral: boolean = true): Promise<InteractionResponse<boolean>> {
    return HelpieReplies.reply(interaction, {
      type: "warning",
      content,
      ephemeral,
    });
  }

  /**
   * Send an info message
   *
   * @example
   * await HelpieReplies.info(interaction, 'Here are the available contexts...');
   */
  static async info(interaction: ChatInputCommandInteraction, content: ReplyContent, ephemeral: boolean = false): Promise<InteractionResponse<boolean>> {
    return HelpieReplies.reply(interaction, {
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
