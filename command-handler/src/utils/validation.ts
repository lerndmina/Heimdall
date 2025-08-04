import type { ValidationResult, ValidationContext } from "../types";
import { createLogger, LogLevel } from "@heimdall/logger";

const logger = createLogger("validation-utils", {
  minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
  enableFileLogging: process.env.LOG_TO_FILE === "true",
});

/**
 * Executes a validation function and normalizes the result
 */
export async function executeValidation(validationFn: Function, context: ValidationContext): Promise<ValidationResult> {
  try {
    const result = await validationFn(context);

    // Handle legacy boolean return (CommandKit compatibility)
    // CommandKit: true = stop command, false = continue
    if (typeof result === "boolean") {
      return { proceed: !result };
    }

    // Handle modern ValidationResult return
    if (typeof result === "object" && result !== null) {
      return {
        proceed: result.proceed ?? true,
        error: result.error,
        ephemeral: result.ephemeral,
      };
    }

    // Default to proceeding if result is unclear
    return { proceed: true };
  } catch (error) {
    logger.error("Validation execution error:", error);
    return {
      proceed: false,
      error: "Validation failed due to an error",
      ephemeral: true,
    };
  }
}

/**
 * Executes legacy validation function (CommandKit compatibility)
 */
export async function executeLegacyValidation(
  validationFn: Function,
  props: {
    interaction: any;
    commandObj: any;
    handler: any;
  }
): Promise<ValidationResult> {
  try {
    const result = await validationFn(props);

    // Legacy CommandKit: true = stop, false = continue
    return { proceed: !result };
  } catch (error) {
    logger.error("Legacy validation execution error:", error);
    return {
      proceed: false,
      error: "Legacy validation failed due to an error",
      ephemeral: true,
    };
  }
}

/**
 * Checks if a validation should be skipped for a command
 */
export function shouldSkipValidation(validationName: string, command: { config?: { advanced?: { validations?: { skip?: string[] } } } }): boolean {
  return command.config?.advanced?.validations?.skip?.includes(validationName) ?? false;
}
