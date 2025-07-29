import { ButtonBuilder, ButtonInteraction, Message, ComponentType, ButtonStyle, InteractionCollectorOptions, MessageComponentType } from "discord.js";

// Signal implementation for reactive state management
type SignalGetter<T> = () => T;
type SignalSetter<T> = (value: T | ((prev: T) => T)) => void;
type SignalDispose = () => void;

// Global context for tracking effect subscribers
const context: (() => void)[] = [];

/**
 * Create a reactive signal
 * @param value Initial value
 * @returns Tuple of [getter, setter, dispose]
 */
export function createSignal<T>(value: T): [SignalGetter<T>, SignalSetter<T>, SignalDispose] {
  const subscribers = new Set<() => void>();
  let disposed = false;
  let val = typeof value === "function" ? (value as any)() : value;

  const getter: SignalGetter<T> = () => {
    if (!disposed) {
      const running = getCurrentObserver();
      if (running) {
        subscribers.add(running);
      }
    }
    return val;
  };

  const setter: SignalSetter<T> = (newValue) => {
    if (disposed) return;
    val = typeof newValue === "function" ? (newValue as any)(val) : newValue;
    for (const subscriber of subscribers) {
      subscriber();
    }
  };

  const dispose: SignalDispose = () => {
    subscribers.clear();
    disposed = true;
  };

  return [getter, setter, dispose];
}

/**
 * Create a reactive effect that runs when signals change
 * @param callback Function to run when dependencies change
 */
export function createEffect(callback: () => void): void {
  const execute = () => {
    context.push(execute);
    try {
      callback();
    } finally {
      context.pop();
    }
  };
  execute();
}

function getCurrentObserver(): (() => void) | undefined {
  return context[context.length - 1];
}

// ButtonKit onClick options interface
export interface ButtonKitOnClickOptions extends Partial<InteractionCollectorOptions<ButtonInteraction>> {
  message: Message;
  time?: number;
  autoReset?: boolean;
}

/**
 * Enhanced ButtonBuilder with onClick functionality
 */
export class ButtonKit extends ButtonBuilder {
  private onClickHandler: ((interaction: ButtonInteraction) => void | Promise<void>) | null = null;
  private onEndHandler: (() => void | Promise<void>) | null = null;
  private contextData: ButtonKitOnClickOptions | null = null;
  private collector: any = null;

  /**
   * Sets up an inline interaction collector for this button
   * @param handler The handler to run when the button is clicked
   * @param data The context data to use for the interaction collector
   * @returns This button for chaining
   */
  onClick(handler: (interaction: ButtonInteraction) => void | Promise<void>, data: ButtonKitOnClickOptions): this {
    if (this.data.style === ButtonStyle.Link) {
      throw new TypeError('Cannot setup "onClick" handler on link buttons.');
    }
    if (!handler) {
      throw new TypeError('Cannot setup "onClick" without a handler function parameter.');
    }

    this.destroyCollector();
    this.onClickHandler = handler;
    if (data) {
      this.contextData = data;
    }
    this.setupInteractionCollector();
    return this;
  }

  /**
   * Sets up a handler for when the collector ends
   * @param handler The handler to run when the collector ends
   * @returns This button for chaining
   */
  onEnd(handler: () => void | Promise<void>): this {
    this.onEndHandler = handler;
    return this;
  }

  /**
   * Dispose the button collector manually
   */
  dispose(): void {
    this.destroyCollector();
  }

  private setupInteractionCollector(): void {
    if (!this.contextData || !this.onClickHandler) return;

    const message = this.contextData.message;
    if (!message) {
      throw new TypeError('Cannot setup "onClick" handler without a message in the context data.');
    }

    // Get the custom ID from the button data
    const buttonJson = this.toJSON();
    const customId = "custom_id" in buttonJson ? buttonJson.custom_id : undefined;
    if (!customId) {
      throw new TypeError('Cannot setup "onClick" handler on a button without a custom id.');
    }

    // Use basic collector options to avoid type conflicts
    const collectorOptions = {
      filter: (interaction: ButtonInteraction) => interaction.customId === customId && interaction.message.id === message.id,
      time: this.contextData.time || 86400000, // 24 hours default
    };

    this.collector = message.createMessageComponentCollector(collectorOptions as any);

    this.collector.on("collect", (interaction: ButtonInteraction) => {
      const handler = this.onClickHandler;
      if (!handler) {
        return this.destroyCollector();
      }

      // Don't destroy collector if there's an active one
      if (!this.collector) {
        return this.collector.stop("destroyed");
      }

      // Auto-reset timer if configured
      if (this.contextData?.autoReset) {
        this.collector.resetTimer();
      }

      return handler(interaction);
    });

    this.collector.on("end", () => {
      this.destroyCollector();
      this.onEndHandler?.();
    });
  }

  private destroyCollector(): void {
    this.collector?.stop("end");
    this.collector?.removeAllListeners();
    this.collector = null;
    this.contextData = null;
    this.onClickHandler = null;
  }
}

export default ButtonKit;
