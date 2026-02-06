import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, type StringSelectMenuInteraction } from "discord.js";
import type { ComponentCallbackService } from "../../../../src/core/services/ComponentCallbackService.js";

type SelectMenuCallback = (interaction: StringSelectMenuInteraction) => Promise<void>;

const DESELECT_VALUE = "heimdall_deselect_menu";

/**
 * HeimdallStringSelectMenuBuilder - String select menu with callbacks
 *
 * Automatically appends a "Deselect" option to dismiss the menu.
 *
 * @example Ephemeral
 * ```ts
 * const menu = new HeimdallStringSelectMenuBuilder(async (i) => {
 *   await i.reply(`You selected: ${i.values.join(", ")}`);
 * }, 300)
 *   .setPlaceholder("Choose an option")
 *   .addOptions([...]);
 *
 * await menu.ready();
 * ```
 */
export class HeimdallStringSelectMenuBuilder extends StringSelectMenuBuilder {
  private _ready: Promise<void>;
  private static callbackService: ComponentCallbackService;
  private _hasDeselect = false;

  static setCallbackService(service: ComponentCallbackService): void {
    HeimdallStringSelectMenuBuilder.callbackService = service;
  }

  constructor(callback: SelectMenuCallback, ttl?: number);
  constructor(handlerId: string, metadata?: Record<string, unknown>);
  constructor(callbackOrHandlerId: SelectMenuCallback | string, ttlOrMetadata?: number | Record<string, unknown>) {
    super();

    if (!HeimdallStringSelectMenuBuilder.callbackService) {
      throw new Error("HeimdallStringSelectMenuBuilder: Callback service not initialized");
    }

    // Ephemeral pattern
    if (typeof callbackOrHandlerId === "function") {
      const callback = callbackOrHandlerId;
      const ttl = ttlOrMetadata as number | undefined;

      const wrappedCallback = async (interaction: StringSelectMenuInteraction) => {
        if (!interaction.isStringSelectMenu()) return;

        // Handle deselect - acknowledge without calling callback
        if (interaction.values?.includes(DESELECT_VALUE)) {
          await interaction.deferUpdate();
          return;
        }

        await callback(interaction);
      };

      this._ready = HeimdallStringSelectMenuBuilder.callbackService
        .register(wrappedCallback as (interaction: import("discord.js").ButtonInteraction | import("discord.js").AnySelectMenuInteraction) => Promise<void>, ttl)
        .then((customId) => {
          this.setCustomId(customId);
        });
    }
    // Persistent pattern
    else {
      const handlerId = callbackOrHandlerId;
      const metadata = ttlOrMetadata as Record<string, unknown> | undefined;

      this._ready = HeimdallStringSelectMenuBuilder.callbackService.createPersistentComponent(handlerId, "selectMenu", metadata).then((customId) => {
        this.setCustomId(customId);
      });
    }
  }

  /**
   * Add deselect option to the menu
   */
  addDeselectOption(): this {
    if (!this._hasDeselect) {
      const deselectOption = new StringSelectMenuOptionBuilder().setLabel("Deselect").setDescription("Clear selection").setValue(DESELECT_VALUE).setEmoji("❌");

      this.addOptions(deselectOption);
      this._hasDeselect = true;
    }
    return this;
  }

  async ready(): Promise<this> {
    await this._ready;
    return this;
  }
}
