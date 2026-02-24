/**
 * /dev subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { handleMongoImport } from "./mongo-import.js";
import { handleDevPanel } from "../../utils/panels/panelHandler.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;

  // ── Owner-only gate ──────────────────────────────────────────────
  const ownerIds = (process.env.OWNER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!ownerIds.includes(interaction.user.id)) {
    await interaction.reply({ content: "❌ This command is restricted to bot owners.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "mongo-import":
      await handleMongoImport(context);
      break;
    case "panel":
      await handleDevPanel(context);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
