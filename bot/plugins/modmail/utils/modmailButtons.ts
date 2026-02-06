/**
 * Shared button and ActionRow builders for modmail.
 *
 * Centralises the 3-line create→style→ready pattern that appears
 * throughout the codebase so every call site is a single await.
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { LibAPI } from "../../lib/index.js";

// ─── Individual button builders ─────────────────────────────────

/**
 * "Close Ticket" button (Danger / 🔒)
 * Used after ticket creation to let the user close their own ticket.
 */
export async function createCloseTicketButton(lib: LibAPI): Promise<ButtonBuilder> {
  const btn = lib.createButtonBuilderPersistent("modmail.user.close");
  btn.setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒");
  await btn.ready();
  return btn;
}

/**
 * "Close Thread" button (Success / ✅)
 * Used on the resolved DM to let the user close a resolved ticket.
 */
export async function createCloseThreadButton(lib: LibAPI): Promise<ButtonBuilder> {
  const btn = lib.createButtonBuilderPersistent("modmail.user.close");
  btn.setLabel("Close Thread").setStyle(ButtonStyle.Success).setEmoji("✅");
  await btn.ready();
  return btn;
}

/**
 * "I Need More Help" button (Danger / 🆘)
 * Used on the resolved DM to let the user cancel the auto-close timer.
 */
export async function createNeedMoreHelpButton(lib: LibAPI, modmailId: string): Promise<ButtonBuilder> {
  const btn = lib.createButtonBuilderPersistent("modmail.user.reopen", { modmailId });
  btn.setLabel("I Need More Help").setStyle(ButtonStyle.Danger).setEmoji("🆘");
  await btn.ready();
  return btn;
}

// ─── Pre-built ActionRow helpers ────────────────────────────────

/**
 * Single-button row with "Close Ticket" (Danger / 🔒).
 * Used after ticket creation in DM confirmations.
 */
export async function createCloseTicketRow(lib: LibAPI): Promise<ActionRowBuilder<ButtonBuilder>> {
  const btn = await createCloseTicketButton(lib);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}

/**
 * Two-button row: "Close Thread" + "I Need More Help".
 * Used on the resolved DM sent to the user.
 */
export async function createResolveButtonRow(lib: LibAPI, modmailId: string): Promise<ActionRowBuilder<ButtonBuilder>> {
  const [closeBtn, helpBtn] = await Promise.all([createCloseThreadButton(lib), createNeedMoreHelpButton(lib, modmailId)]);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn, helpBtn);
}
