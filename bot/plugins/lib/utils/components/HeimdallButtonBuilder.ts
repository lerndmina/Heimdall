import { ButtonBuilder, type ButtonInteraction } from "discord.js";
import type { ComponentCallbackService } from "../../../../src/core/services/ComponentCallbackService.js";

type ButtonCallback = (interaction: ButtonInteraction) => Promise<void>;

/**
 * HeimdallButtonBuilder - Button with ephemeral or persistent callbacks
 *
 * ⚠️ CRITICAL: Must call await button.ready() before using the button!
 *
 * @example Ephemeral (auto-expires)
 * ```ts
 * const button = new HeimdallButtonBuilder(async (i) => {
 *   await i.reply("Clicked!");
 * }, 300) // 5 minute TTL
 *   .setLabel("Click Me")
 *   .setStyle(ButtonStyle.Primary);
 *
 * await button.ready(); // REQUIRED
 * const row = new ActionRowBuilder().addComponents(button);
 * ```
 *
 * @example Persistent (survives restart)
 * ```ts
 * // First register handler (once at startup)
 * componentCallbackService.registerPersistentHandler("my_button", async (i) => { ... });
 *
 * // Then create button
 * const button = new HeimdallButtonBuilder("my_button", { userId: "123" });
 * await button.ready();
 * ```
 */
export class HeimdallButtonBuilder extends ButtonBuilder {
  private _ready: Promise<void>;
  private static callbackService: ComponentCallbackService;

  /**
   * Set the callback service (called by lib plugin on load)
   */
  static setCallbackService(service: ComponentCallbackService): void {
    HeimdallButtonBuilder.callbackService = service;
  }

  /**
   * Create ephemeral button with inline callback
   */
  constructor(callback: ButtonCallback, ttl?: number);

  /**
   * Create persistent button with handler ID
   */
  constructor(handlerId: string, metadata?: Record<string, unknown>);

  constructor(callbackOrHandlerId: ButtonCallback | string, ttlOrMetadata?: number | Record<string, unknown>) {
    super();

    if (!HeimdallButtonBuilder.callbackService) {
      throw new Error("HeimdallButtonBuilder: Callback service not initialized. Is the lib plugin loaded?");
    }

    // Ephemeral pattern: (callback, ttl?)
    if (typeof callbackOrHandlerId === "function") {
      const callback = callbackOrHandlerId;
      const ttl = ttlOrMetadata as number | undefined;

      const wrappedCallback = async (interaction: ButtonInteraction) => {
        if (!interaction.isButton()) return;
        await callback(interaction);
      };

      this._ready = HeimdallButtonBuilder.callbackService
        .register(wrappedCallback as (interaction: import("discord.js").ButtonInteraction | import("discord.js").AnySelectMenuInteraction) => Promise<void>, ttl)
        .then((customId) => {
          this.setCustomId(customId);
        });
    }
    // Persistent pattern: (handlerId, metadata?)
    else {
      const handlerId = callbackOrHandlerId;
      const metadata = ttlOrMetadata as Record<string, unknown> | undefined;

      this._ready = HeimdallButtonBuilder.callbackService.createPersistentComponent(handlerId, "button", metadata).then((customId) => {
        this.setCustomId(customId);
      });
    }
  }

  /**
   * Wait for the button to be ready (customId set)
   * ⚠️ CRITICAL: Must await this before adding button to ActionRow!
   */
  async ready(): Promise<this> {
    await this._ready;
    return this;
  }
}
