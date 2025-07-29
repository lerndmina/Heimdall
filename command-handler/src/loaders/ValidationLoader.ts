import type { 
  UniversalValidation, 
  CommandSpecificValidation,
  LegacyValidationExport 
} from "../types";
import { discoverFiles, safeImport, getFileNameWithoutExtension } from "../utils/fileUtils";

export class ValidationLoader {
  /**
   * Loads all validations from the specified directory with new naming scheme
   */
  async loadValidations(validationsPath: string): Promise<{
    universal: Map<string, UniversalValidation>;
    commandSpecific: Map<string, CommandSpecificValidation[]>;
  }> {
    const universal = new Map<string, UniversalValidation>();
    const commandSpecific = new Map<string, CommandSpecificValidation[]>();
    
    console.log(`Loading validations from: ${validationsPath}`);
    
    // Discover all validation files
    const files = await discoverFiles(validationsPath, ['.ts', '.js']);
    console.log(`Found ${files.length} potential validation files`);
    
    for (const file of files) {
      const filename = getFileNameWithoutExtension(file);
      
      try {
        if (filename.startsWith('+')) {
          // Universal validation
          const validation = await this.loadUniversalValidation(file, filename);
          if (validation) {
            universal.set(validation.name, validation);
            console.log(`Loaded universal validation: ${validation.name}`);
          }
        } else if (filename.startsWith('validate.')) {
          // Command-specific validation
          const commandName = filename.replace('validate.', '');
          const validation = await this.loadCommandValidation(file, commandName);
          if (validation) {
            if (!commandSpecific.has(commandName)) {
              commandSpecific.set(commandName, []);
            }
            commandSpecific.get(commandName)!.push(validation);
            console.log(`Loaded command-specific validation for: ${commandName}`);
          }
        }
        // Ignore files that don't match either pattern
      } catch (error) {
        console.error(`Failed to load validation from ${file}:`, error);
      }
    }
    
    const universalCount = universal.size;
    const commandSpecificCount = Array.from(commandSpecific.values())
      .reduce((sum, arr) => sum + arr.length, 0);
    
    console.log(`Successfully loaded ${universalCount} universal validations and ${commandSpecificCount} command-specific validations`);
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
    
    if (this.isLegacyValidation(exports)) {
      // Legacy validation - adapt to new format
      return {
        name: validationName,
        execute: async (ctx) => {
          // Convert to legacy format for backward compatibility
          const legacyProps = {
            interaction: ctx.interaction,
            commandObj: { data: ctx.command.data, options: ctx.command.config },
            handler: ctx.handler
          };
          
          const result = await exports.default(legacyProps);
          // Legacy: true = stop, false = continue
          return { proceed: !result };
        }
      };
    } else if (this.isModernValidation(exports)) {
      // Modern validation
      return {
        name: validationName,
        execute: exports.execute
      };
    } else {
      console.warn(`Invalid validation export pattern in ${filePath}`);
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
    
    if (this.isLegacyValidation(exports)) {
      // Legacy validation - adapt to new format
      return {
        commandName,
        execute: async (ctx) => {
          // Convert to legacy format for backward compatibility
          const legacyProps = {
            interaction: ctx.interaction,
            commandObj: { data: ctx.command.data, options: ctx.command.config },
            handler: ctx.handler
          };
          
          const result = await exports.default(legacyProps);
          // Legacy: true = stop, false = continue
          return { proceed: !result };
        }
      };
    } else if (this.isModernValidation(exports)) {
      // Modern validation
      return {
        commandName,
        execute: exports.execute
      };
    } else {
      console.warn(`Invalid validation export pattern in ${filePath}`);
      return null;
    }
  }
  
  /**
   * Checks if exports match legacy validation pattern
   */
  private isLegacyValidation(exports: any): exports is LegacyValidationExport {
    return typeof exports.default === 'function';
  }
  
  /**
   * Checks if exports match modern validation pattern
   */
  private isModernValidation(exports: any): boolean {
    return typeof exports.execute === 'function';
  }
}
