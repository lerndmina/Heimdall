import { ChannelSelectMenuBuilder, type ChannelSelectMenuInteraction } from "discord.js";
import type { ComponentCallbackService } from "../../../../src/core/services/ComponentCallbackService.js";

type SelectMenuCallback = (interaction: ChannelSelectMenuInteraction) => Promise<void>;

export class HeimdallChannelSelectMenuBuilder extends ChannelSelectMenuBuilder {
  private _ready: Promise<void>;
  private static callbackService: ComponentCallbackService;

  static setCallbackService(service: ComponentCallbackService): void {
    HeimdallChannelSelectMenuBuilder.callbackService = service;
  }

  constructor(callback: SelectMenuCallback, ttl?: number);
  constructor(handlerId: string, metadata?: Record<string, unknown>);
  constructor(callbackOrHandlerId: SelectMenuCallback | string, ttlOrMetadata?: number | Record<string, unknown>) {
    super();

    if (!HeimdallChannelSelectMenuBuilder.callbackService) {
      throw new Error("HeimdallChannelSelectMenuBuilder: Callback service not initialized");
    }

    if (typeof callbackOrHandlerId === "function") {
      const callback = callbackOrHandlerId;
      const ttl = ttlOrMetadata as number | undefined;

      const wrappedCallback = async (interaction: ChannelSelectMenuInteraction) => {
        if (!interaction.isChannelSelectMenu()) return;
        await callback(interaction);
      };

      this._ready = HeimdallChannelSelectMenuBuilder.callbackService
        .register(wrappedCallback as (interaction: import("discord.js").ButtonInteraction | import("discord.js").AnySelectMenuInteraction) => Promise<void>, ttl)
        .then((customId) => {
          this.setCustomId(customId);
        });
    } else {
      const handlerId = callbackOrHandlerId;
      const metadata = ttlOrMetadata as Record<string, unknown> | undefined;

      this._ready = HeimdallChannelSelectMenuBuilder.callbackService.createPersistentComponent(handlerId, "selectMenu", metadata).then((customId) => {
        this.setCustomId(customId);
      });
    }
  }

  async ready(): Promise<this> {
    await this._ready;
    return this;
  }
}
