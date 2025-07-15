import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, InteractionReplyOptions } from "discord.js";
import { Client } from "discord.js";
import BasicEmbed from "./BasicEmbed";

/**
 * Builds consistent responses for interaction replies
 */
export class ResponseBuilder {
  private content?: string;
  private embeds: EmbedBuilder[] = [];
  private components: ActionRowBuilder<ButtonBuilder>[] = [];
  private ephemeral: boolean = false;

  /**
   * Create a new response builder
   */
  constructor(private client: Client<true>) {}

  /**
   * Add text content to the response
   */
  withContent(content: string): this {
    this.content = content;
    return this;
  }

  /**
   * Add an embed to the response
   */
  withEmbed(title: string, description: string): this {
    this.embeds.push(BasicEmbed(this.client, title, description));
    return this;
  }

  /**
   * Add a button to view a URL
   */
  withLinkButton(label: string, url: string): this {
    const button = new ButtonBuilder()
      .setLabel(label)
      .setStyle(5) // Link style
      .setURL(url);

    // Check if we already have a row with space
    const existingRow = this.components[0];
    if (existingRow && existingRow.components.length < 5) {
      existingRow.addComponents(button);
    } else {
      // Create a new row
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
      this.components.push(row);
    }

    return this;
  }

  /**
   * Make the response ephemeral (only visible to the command user)
   */
  makeEphemeral(): this {
    this.ephemeral = true;
    return this;
  }

  /**
   * Build the final interaction reply options
   */
  build(): InteractionReplyOptions {
    return {
      content: this.content,
      embeds: this.embeds.length > 0 ? this.embeds : undefined,
      components: this.components.length > 0 ? this.components : undefined,
      ephemeral: this.ephemeral,
    };
  }
}
