import { Client } from "discord.js";
import type { CommandHandler } from "../CommandHandler";

// Event interfaces
export interface LegacyEventData {
  default: (client: Client<true>, ...args: any[]) => Promise<void> | void;
}

export interface ModernEventData {
  event: string;
  once?: boolean;
  execute: (client: Client<true>, handler: CommandHandler, ...args: any[]) => Promise<void> | void;
}

export interface LoadedEvent {
  name: string;
  filePath: string;
  isLegacy: boolean;
  once: boolean;
  execute: (client: Client<true>, handler: CommandHandler, ...args: any[]) => Promise<void> | void;
}
