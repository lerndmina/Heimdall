import * as fs from "fs";
import * as path from "path";
import { createLogger, LogLevel } from "@heimdall/logger";

const logger = createLogger("file-utils", {
  minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
  enableFileLogging: process.env.LOG_TO_FILE === "true",
});

/**
 * Recursively discovers files with specific extensions
 */
export async function discoverFiles(directory: string, extensions: string[] = [".ts", ".js"]): Promise<string[]> {
  const files: string[] = [];

  if (!fs.existsSync(directory)) {
    return files;
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      const subFiles = await discoverFiles(fullPath, extensions);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Safely imports a module and handles errors
 */
export async function safeImport(filePath: string): Promise<any | null> {
  try {
    // Clear require cache to support hot reloading
    delete require.cache[require.resolve(filePath)];
    return await import(filePath);
  } catch (error) {
    logger.error(`Failed to import ${filePath}:`, error);
    return null;
  }
}

/**
 * Checks if a file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Gets the filename without extension
 */
export function getFileNameWithoutExtension(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}
