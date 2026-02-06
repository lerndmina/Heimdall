/**
 * InteractionFlow - Unified single-message panel lifecycle manager
 *
 * Handles the complexity of managing a single ephemeral message across
 * different interaction types (slash command, button, select menu, modal).
 *
 * Usage:
 * ```ts
 * const flow = new InteractionFlow(interaction);
 * await flow.init({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
 *
 * // In button/select callback - update the same panel
 * await flow.update({ embeds: [newEmbed], components: [newRow] }, buttonInteraction);
 * ```
 */

import { Message, MessageFlags, type RepliableInteraction, type BaseMessageOptions } from "discord.js";

type FlowInteraction = RepliableInteraction;
type FlowPayload = BaseMessageOptions & { flags?: MessageFlags };

export class InteractionFlow {
  private message: Message | null = null;
  private lastInteraction: FlowInteraction | null = null;

  constructor(private origin: FlowInteraction) {
    this.lastInteraction = origin;
  }

  /**
   * Initialize the flow by replying to the origin interaction.
   */
  async init(payload: FlowPayload): Promise<Message> {
    this.lastInteraction = this.origin;

    if (this.origin.deferred || this.origin.replied) {
      const { flags: _flags, ...editPayload } = payload;
      this.message = await this.origin.editReply(editPayload);
    } else {
      await this.origin.reply(payload as any);
      this.message = await this.origin.fetchReply();
    }

    return this.message;
  }

  /**
   * Update the existing panel message.
   *
   * @param payload - New content to display
   * @param interaction - The interaction that triggered this update (button/select/modal)
   */
  async update(payload: FlowPayload, interaction?: FlowInteraction): Promise<Message | null> {
    const { flags: _flags, ...editPayload } = payload;

    if (interaction) {
      this.lastInteraction = interaction;

      // Component interaction (Button/Select) — use .update() to acknowledge + edit in one call
      if (interaction.isMessageComponent()) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.update(editPayload as any);
          this.message = await interaction.fetchReply();
          return this.message;
        }
      }

      // Modal submit or already-deferred component — deferUpdate then editReply
      if (!interaction.deferred && !interaction.replied) {
        if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
          await interaction.deferUpdate();
        } else {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
      }

      this.message = await interaction.editReply(editPayload);
      return this.message;
    }

    // No interaction provided — edit the stored message via last interaction
    if (this.lastInteraction) {
      try {
        this.message = await this.lastInteraction.editReply(editPayload);
        return this.message;
      } catch (error: any) {
        // Handle Unknown Message (10008) — message was deleted, recover via followUp
        if (error.code === 10008 && this.lastInteraction) {
          try {
            this.message = (await this.lastInteraction.followUp({
              ...editPayload,
              flags: MessageFlags.Ephemeral,
            } as any)) as Message;
            return this.message;
          } catch {
            throw error;
          }
        }
        throw error;
      }
    }

    throw new Error("InteractionFlow: No interaction context to update.");
  }

  /**
   * Smart send: initializes if not started, updates otherwise.
   */
  async send(payload: FlowPayload): Promise<Message> {
    if (this.message) {
      return (await this.update(payload)) as Message;
    }
    return this.init(payload);
  }

  /**
   * Get the current message reference.
   */
  getMessage(): Message | null {
    return this.message;
  }

  /**
   * Get the last interaction used.
   */
  getLastInteraction(): FlowInteraction | null {
    return this.lastInteraction;
  }
}
