import type { UniversalValidation, CommandSpecificValidation, LegacyValidationExport } from "../types";
import { discoverFiles, safeImport, getFileNameWithoutExtension } from "../utils/fileUtils";
import { createLogger, LogLevel } from "@heimdall/logger";

export class ValidationLoader {
  private logger = createLogger("command-handler", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  /**
   * Loads all validations from the specified directory with new naming scheme
   */
  async loadValidations(validationsPath: string): Promise<{
    universal: Map<string, UniversalValidation>;
    commandSpecific: Map<string, CommandSpecificValidation[]>;
  }> {
    const universal = new Map<string, UniversalValidation>();
    const commandSpecific = new Map<string, CommandSpecificValidation[]>();

    this.logger.debug(`Loading validations from: ${validationsPath}`);

    // Discover all validation files
    const files = await discoverFiles(validationsPath, [".ts", ".js"]);
    this.logger.debug(`Found ${files.length} potential validation files`);

    for (const file of files) {
      const filename = getFileNameWithoutExtension(file);

      try {
        if (filename.startsWith("+")) {
          // Universal validation
          const validation = await this.loadUniversalValidation(file, filename);
          if (validation) {
            universal.set(validation.name, validation);
            this.logger.debug(`Loaded universal validation: ${validation.name}`);
          }
        } else if (filename.startsWith("validate.")) {
          // Command-specific validation
          const commandName = filename.replace("validate.", "");
          const validation = await this.loadCommandValidation(file, commandName);
          if (validation) {
            if (!commandSpecific.has(commandName)) {
              commandSpecific.set(commandName, []);
            }
            commandSpecific.get(commandName)!.push(validation);
            this.logger.debug(`Loaded command-specific validation for: ${commandName}`);
          }
        }
        // Ignore files that don't match either pattern
      } catch (error) {
        this.logger.error(`Failed to load validation from ${file}:`, error);
      }
    }

    const universalCount = universal.size;
    const commandSpecificCount = Array.from(commandSpecific.values()).reduce((sum, arr) => sum + arr.length, 0);

    this.logger.debug(`Successfully loaded ${universalCount} universal validations and ${commandSpecificCount} command-specific validations`);
    return { universal, commandSpecific };
  }

  /**
   * Loads a universal validation (filename starts with +)
   */
  private async loadUniversalValidation(filePath: string, filename: string): Promise<UniversalValidation | null> {
    const exports = await safeImport(filePath);
    if (!exports) {
      return null;
    }

    const validationName = filename.substring(1); // Remove the + prefix

    // All validations are modern - they export a default function that takes ValidationContext and returns ValidationResult
    if (typeof exports.default === "function") {
      return {
        name: validationName,
        execute: exports.default,
      };
    } else {
      this.logger.error(
        `Invalid universal validation in ${filePath}: Expected 'export default function' but found ${typeof exports.default}. Universal validations must export a default function that takes ValidationContext and returns ValidationResult.`
      );
      return null;
    }
  }

  /**
   * Loads a command-specific validation (filename starts with validate.)
   */
  private async loadCommandValidation(filePath: string, commandName: string): Promise<CommandSpecificValidation | null> {
    const exports = await safeImport(filePath);
    if (!exports) {
      return null;
    }

    // All validations are modern - they export a default function that takes ValidationContext and returns ValidationResult
    if (typeof exports.default === "function") {
      return {
        commandName,
        execute: exports.default,
      };
    } else {
      this.logger.error(
        `Invalid command-specific validation in ${filePath}: Expected 'export default function' but found ${typeof exports.default}. Command-specific validations must export a default function that takes ValidationContext and returns ValidationResult.`
      );
      return null;
    }
  }
}
