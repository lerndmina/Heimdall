import { UserSelectMenuBuilder, type UserSelectMenuInteraction } from "discord.js";
import type { ComponentCallbackService } from "../../../../src/core/services/ComponentCallbackService.js";

type SelectMenuCallback = (interaction: UserSelectMenuInteraction) => Promise<void>;

export class HeimdallUserSelectMenuBuilder extends UserSelectMenuBuilder {
  private _ready: Promise<void>;
  private static callbackService: ComponentCallbackService;

  static setCallbackService(service: ComponentCallbackService): void {
    HeimdallUserSelectMenuBuilder.callbackService = service;
  }

  constructor(callback: SelectMenuCallback, ttl?: number);
  constructor(handlerId: string, metadata?: Record<string, unknown>);
  constructor(callbackOrHandlerId: SelectMenuCallback | string, ttlOrMetadata?: number | Record<string, unknown>) {
    super();

    if (!HeimdallUserSelectMenuBuilder.callbackService) {
      throw new Error("HeimdallUserSelectMenuBuilder: Callback service not initialized");
    }

    if (typeof callbackOrHandlerId === "function") {
      const callback = callbackOrHandlerId;
      const ttl = ttlOrMetadata as number | undefined;

      const wrappedCallback = async (interaction: UserSelectMenuInteraction) => {
        if (!interaction.isUserSelectMenu()) return;
        await callback(interaction);
      };

      this._ready = HeimdallUserSelectMenuBuilder.callbackService
        .register(wrappedCallback as (interaction: import("discord.js").ButtonInteraction | import("discord.js").AnySelectMenuInteraction) => Promise<void>, ttl)
        .then((customId) => {
          this.setCustomId(customId);
        });
    } else {
      const handlerId = callbackOrHandlerId;
      const metadata = ttlOrMetadata as Record<string, unknown> | undefined;

      this._ready = HeimdallUserSelectMenuBuilder.callbackService.createPersistentComponent(handlerId, "selectMenu", metadata).then((customId) => {
        this.setCustomId(customId);
      });
    }
  }

  async ready(): Promise<this> {
    await this._ready;
    return this;
  }
}
