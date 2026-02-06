/**
 * InteractionFlow - Unified abstraction for managing message flow
 *
 * Handles the complexity of:
 * - Starting from a Message (reply)
 * - Starting from an Interaction (reply/defer)
 * - Updating via Button/Select (update/edit)
 * - Updating via Modal (deferUpdate + edit)
 */

import {
  Message,
  ButtonInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  RoleSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  ModalSubmitInteraction,
  CommandInteraction,
  type RepliableInteraction,
  type BaseMessageOptions,
} from "discord.js";

type FlowInteraction =
  | RepliableInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | RoleSelectMenuInteraction
  | ChannelSelectMenuInteraction
  | MentionableSelectMenuInteraction
  | ModalSubmitInteraction
  | CommandInteraction;

type FlowPayload = BaseMessageOptions & { ephemeral?: boolean };

export class InteractionFlow {
  private message: Message | null = null;
  private lastInteraction: FlowInteraction | null = null;

  constructor(private origin: Message | FlowInteraction) {
    if (!(origin instanceof Message)) {
      this.lastInteraction = origin;
    }
  }

  /**
   * Initialize the flow by sending the first message
   */
  async init(payload: FlowPayload): Promise<Message> {
    if (this.origin instanceof Message) {
      this.message = await this.origin.reply(payload as any);
    } else {
      this.lastInteraction = this.origin;
      if (this.origin.deferred || this.origin.replied) {
        this.message = await this.origin.editReply(payload);
      } else {
        const response = await this.origin.reply({ ...payload, fetchReply: true } as any);
        this.message = response instanceof Message ? response : await this.origin.fetchReply();
      }
    }
    return this.message;
  }

  /**
   * Smart send: Initializes flow if not started, or updates existing message
   */
  async send(payload: FlowPayload): Promise<Message> {
    if (this.message) {
      return (await this.update(payload)) as Message;
    }
    return this.init(payload);
  }

  /**
   * Update the existing message with new content
   */
  async update(payload: FlowPayload, interaction?: FlowInteraction): Promise<Message | null> {
    if (interaction) {
      this.lastInteraction = interaction;

      // Component interactions can use .update()
      if (interaction.isMessageComponent()) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.update(payload as any);
          this.message = await interaction.fetchReply();
          return this.message;
        }
      }

      // Modal submit or already deferred - use deferUpdate + editReply
      if (!interaction.deferred && !interaction.replied) {
        if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
          await interaction.deferUpdate();
        } else {
          await interaction.deferReply({ ephemeral: payload.ephemeral ?? true });
        }
      }

      this.message = await interaction.editReply(payload);
      return this.message;
    }

    // No new interaction - use last known interaction or edit message directly
    if (this.lastInteraction && !this.lastInteraction.deferred && !this.lastInteraction.replied) {
      if (this.lastInteraction.isMessageComponent()) {
        await this.lastInteraction.update(payload as any);
        this.message = await this.lastInteraction.fetchReply();
        return this.message;
      }
    }

    if (this.lastInteraction) {
      this.message = await this.lastInteraction.editReply(payload);
      return this.message;
    }

    if (this.message) {
      return this.message.edit(payload as any);
    }

    return null;
  }

  /**
   * Show a message without updating the stored reference
   * Used for ephemeral responses that shouldn't affect the main flow
   */
  async show(payload: FlowPayload): Promise<Message | null> {
    if (this.lastInteraction) {
      if (!this.lastInteraction.deferred && !this.lastInteraction.replied) {
        const response = await this.lastInteraction.reply({ ...payload, fetchReply: true } as any);
        return response instanceof Message ? response : await this.lastInteraction.fetchReply();
      }
      return this.lastInteraction.editReply(payload);
    }
    if (this.message) {
      return this.message.edit(payload as any);
    }
    return null;
  }
}
