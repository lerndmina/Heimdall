import * as path from "path";

/**
 * Normalizes a path to use forward slashes
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * Gets the relative path from base to target
 */
export function getRelativePath(base: string, target: string): string {
  return path.relative(base, target);
}

/**
 * Converts a file path to a command/event name
 * Example: /commands/utilities/ping.ts -> ping
 */
export function pathToName(filePath: string, basePath: string): string {
  const relativePath = getRelativePath(basePath, filePath);
  const withoutExt = relativePath.replace(/\.(ts|js)$/, "");
  const parts = withoutExt.split(path.sep);
  return parts[parts.length - 1]; // Return just the filename
}

/**
 * Converts a file path to an event name based on directory structure
 * Example: /events/ready/loggedIn.ts -> ready
 */
export function pathToEventName(filePath: string, basePath: string): string {
  const relativePath = getRelativePath(basePath, filePath);
  const parts = relativePath.split(path.sep);

  // If file is in a subdirectory, use the directory name as event name
  if (parts.length > 1) {
    return parts[0];
  }

  // Otherwise use the filename without extension
  return parts[0].replace(/\.(ts|js)$/, "");
}

/**
 * Validates that a path is within the expected base path (security)
 */
export function isPathSafe(targetPath: string, basePath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(basePath);
  return resolvedTarget.startsWith(resolvedBase);
}
