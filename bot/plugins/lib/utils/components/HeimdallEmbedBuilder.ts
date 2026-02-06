import { EmbedBuilder, type ColorResolvable } from "discord.js";
import { getRandomFooterMessage } from "../messages.js";

/**
 * Default Heimdall embed color (pink/magenta #de3b79)
 */
export const HEIMDALL_COLOR: ColorResolvable = 0xde3b79;

/**
 * HeimdallEmbedBuilder - Styled embed builder with default Heimdall theming
 *
 * Automatically applies:
 * - Default color (#de3b79)
 * - Timestamp
 * - Random footer message
 */
export class HeimdallEmbedBuilder extends EmbedBuilder {
  constructor() {
    super();
    this.setColor(HEIMDALL_COLOR);
    this.setTimestamp();
    this.setFooter({ text: getRandomFooterMessage() });
  }

  /**
   * Override color (use sparingly - prefer default theming)
   */
  override setColor(color: ColorResolvable): this {
    return super.setColor(color);
  }

  /**
   * Create error embed with red color
   */
  static error(message: string): HeimdallEmbedBuilder {
    return new HeimdallEmbedBuilder().setColor(0xef4444).setDescription(`❌ ${message}`);
  }

  /**
   * Create success embed with green color
   */
  static success(message: string): HeimdallEmbedBuilder {
    return new HeimdallEmbedBuilder().setColor(0x22c55e).setDescription(`✅ ${message}`);
  }

  /**
   * Create warning embed with yellow color
   */
  static warning(message: string): HeimdallEmbedBuilder {
    return new HeimdallEmbedBuilder().setColor(0xeab308).setDescription(`⚠️ ${message}`);
  }

  /**
   * Create info embed with blue color
   */
  static info(message: string): HeimdallEmbedBuilder {
    return new HeimdallEmbedBuilder().setColor(0x3b82f6).setDescription(`ℹ️ ${message}`);
  }
}
