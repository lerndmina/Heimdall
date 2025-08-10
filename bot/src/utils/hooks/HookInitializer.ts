import { hookManager } from "./HookManager";
import { ServerSelectionHook } from "./defaults/ServerSelectionHook";
import { CategorySelectionHook } from "./defaults/CategorySelectionHook";
import { AIResponseHook } from "./defaults/AIResponseHook";
import log from "../log";

/**
 * Initialize the modmail hook system with default hooks
 * This should be called during bot startup
 */
export function initializeModmailHooks(): void {
  log.info("Initializing modmail hook system...");

  try {
    // Register default hooks
    const serverSelectionHook = new ServerSelectionHook();
    const categorySelectionHook = new CategorySelectionHook();
    const aiResponseHook = new AIResponseHook();

    hookManager.registerHook(serverSelectionHook);
    hookManager.registerHook(categorySelectionHook);
    hookManager.registerHook(aiResponseHook);

    // Log initialization results
    const stats = hookManager.getStats();
    log.info(`Modmail hooks initialized successfully:`, {
      totalHooks: stats.totalHooks,
      enabledHooks: stats.enabledHooks,
      hooksByType: stats.hooksByType,
    });

    log.info("Available hook types:", Object.keys(stats.hooksByType));
  } catch (error) {
    log.error("Failed to initialize modmail hooks:", error);
    throw error;
  }
}

/**
 * Cleanup the hook system (useful for testing or restart)
 */
export function cleanupModmailHooks(): void {
  log.info("Cleaning up modmail hook system...");
  hookManager.clearAllHooks();
  log.info("Modmail hooks cleaned up successfully");
}
