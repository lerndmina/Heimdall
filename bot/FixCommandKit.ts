import fs from "fs";
import path from "path";

/**
 * Replaces the broken CommandKit file with our fixed version in patch mode,
 * or restores the original backup in production mode
 * This should be called before importing CommandKit
 */
export function fixCommandKit(): void {
  const fixedFilePath = path.join(process.cwd(), "fixedcommandkit.js");
  const brokenFilePath = path.join(process.cwd(), "node_modules", "commandkit", "dist", "index.js");
  const backupFilePath = brokenFilePath + ".backup";

  try {
    if (process.env.PATCH_CKIT === "true") {
      // Patch mode - apply fix
      console.log("Patch mode - applying CommandKit fix");

      // Check if our fixed file exists
      if (!fs.existsSync(fixedFilePath)) {
        console.warn("Fixed CommandKit file not found at:", fixedFilePath);
        return;
      }

      // Check if the target file exists
      if (!fs.existsSync(brokenFilePath)) {
        console.warn("CommandKit file not found at:", brokenFilePath);
        return;
      }

      // Check if already patched by looking for the export
      const currentContent = fs.readFileSync(brokenFilePath, "utf8");
      if (currentContent.includes("export const patched = true;")) {
        console.log("CommandKit is already patched - no action needed");
        return;
      }

      // Create a backup of the original file (if it doesn't exist already)
      if (!fs.existsSync(backupFilePath)) {
        fs.copyFileSync(brokenFilePath, backupFilePath);
        console.info("Created backup of original CommandKit file at:", backupFilePath);
      }

      // Copy our fixed file over the broken one
      fs.copyFileSync(fixedFilePath, brokenFilePath);
      console.info("Successfully replaced CommandKit file with fixed version");

      // Restart the bot after patching
      console.log("Restarting bot to apply patch...");
      process.exit(0);
    } else {
      // Production mode - restore backup if it exists
      console.log("Production mode - restoring original CommandKit file");

      if (fs.existsSync(backupFilePath)) {
        fs.copyFileSync(backupFilePath, brokenFilePath);
        fs.unlinkSync(backupFilePath);
        console.info("Successfully restored original CommandKit file from backup");
      } else {
        console.log("No backup file found - CommandKit file unchanged");
      }
    }
  } catch (error) {
    console.error("Failed to process CommandKit file:", error);
    // Don't throw here - let the bot continue even if the operation fails
  }
}
