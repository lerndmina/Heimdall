import { RepliableInteraction } from "discord.js";
import type { LoadedCommand } from "./Command";
import type { CommandHandler } from "../CommandHandler";

// Validation context and result types
export interface ValidationContext {
  interaction: RepliableInteraction;
  command: LoadedCommand;
  handler: CommandHandler;
}

export interface ValidationResult {
  proceed: boolean; // true = continue, false = stop command
  error?: string;
  ephemeral?: boolean;
}

// Universal validation (files starting with +)
export interface UniversalValidation {
  name: string;
  execute: (ctx: ValidationContext) => Promise<ValidationResult> | ValidationResult;
}

// Command-specific validation (files starting with validate.X)
export interface CommandSpecificValidation {
  commandName: string;
  execute: (ctx: ValidationContext) => Promise<ValidationResult> | ValidationResult;
}

// Legacy validation export (for backward compatibility)
export interface LegacyValidationExport {
  default: (props: {
    interaction: RepliableInteraction;
    commandObj: { data: any; options?: any };
    handler: CommandHandler;
  }) => Promise<boolean> | boolean;
}
