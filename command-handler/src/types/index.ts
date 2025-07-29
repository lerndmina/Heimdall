// Re-export all types for easy importing
export * from "./Command";
export * from "./Event";
export * from "./Validation";
export * from "./Handler";

// CommandKit compatibility exports - these are deprecated but provided for migration
import type { CommandHandler } from "../CommandHandler";
import type { LegacySlashCommandProps } from "./Command";

// Compatibility type aliases
export type CommandKit = CommandHandler; // For backwards compatibility
export type CommandProps = LegacySlashCommandProps; // Legacy alias

// ButtonKit, createSignal, createEffect are now implemented and exported from main index
// These are re-exported here for compatibility but the actual implementations are in ButtonKit.ts
