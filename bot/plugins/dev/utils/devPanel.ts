/**
 * Dev Panel Infrastructure — Shared types, constants, and helpers for the
 * unified `/dev panel` interactive management system.
 */

import { ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { CommandManager } from "../../../src/core/CommandManager.js";
import type { RedisClientType } from "redis";
import type mongoose from "mongoose";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { WebSocketManager } from "../../../src/core/WebSocketManager.js";
import type { LibAPI } from "../../lib/index.js";
import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** TTL for all ephemeral panel components (15 minutes). */
export const PANEL_TTL = 900;

/** Panel identifiers. */
export const PanelId = {
  MAIN: "main",
  STATUS: "status",
  ACTIVITY: "activity",
  CACHE: "cache",
  DATABASE: "database",
  COMMANDS: "commands",
  DEBUG: "debug",
} as const;

export type PanelIdType = (typeof PanelId)[keyof typeof PanelId];

/** Navigation options shown in the main-menu select menu. */
export const PANEL_NAV_OPTIONS = [
  { label: "📊 Bot Status", value: PanelId.STATUS, description: "Uptime, memory, guilds, ping" },
  { label: "🤖 Activity", value: PanelId.ACTIVITY, description: "Manage bot presence & rotation" },
  { label: "💾 Cache / Redis", value: PanelId.CACHE, description: "Inspect & flush the Redis cache" },
  { label: "🗄️ Database", value: PanelId.DATABASE, description: "MongoDB stats & collection tools" },
  { label: "⚡ Commands", value: PanelId.COMMANDS, description: "Refresh or delete slash commands" },
  { label: "🪲 Debug", value: PanelId.DEBUG, description: "Log level, Sentry, process info" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Context passed to every panel builder. */
export interface DevPanelContext {
  lib: LibAPI;
  client: HeimdallClient;
  originalInteraction: ChatInputCommandInteraction;
  commandManager: CommandManager;
  redis: RedisClientType;
  mongoose: typeof mongoose;
  wsManager: WebSocketManager;
  /** Navigate to another panel by ID. Edits the original reply in-place. */
  navigate: (panelId: string) => Promise<void>;
}

/** Return type of every panel builder. */
export interface PanelResult {
  embeds: any[];
  components: ActionRowBuilder<any>[];
}

/** Function signature for a panel builder. */
export type PanelBuilder = (ctx: DevPanelContext) => Promise<PanelResult>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a ◀ Back button that navigates to the main menu.
 * Returns a ready-to-use HeimdallButtonBuilder (already `.ready()`-d).
 */
export async function createBackButton(ctx: DevPanelContext) {
  const btn = ctx.lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      await ctx.navigate(PanelId.MAIN);
    }, PANEL_TTL)
    .setLabel("◀ Back")
    .setStyle(ButtonStyle.Secondary);
  await btn.ready();
  return btn;
}

/**
 * Show a typed-confirmation modal for dangerous actions.
 *
 * @returns `true`  if the user typed the exact confirmation text and the
 *                  interaction was deferred for update.
 * @returns `false` if the user dismissed the modal, timed out, or typed
 *                  the wrong text (an error reply is sent automatically).
 */
export async function requireConfirmation(interaction: ButtonInteraction, title: string, confirmText: string, description: string): Promise<boolean> {
  const modalId = nanoid();
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("confirm")
          .setLabel(`Type "${confirmText}" to confirm`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(confirmText.length + 10)
          .setPlaceholder(confirmText),
      ),
    );

  await interaction.showModal(modal);
  const submit = await interaction
    .awaitModalSubmit({
      filter: (s) => s.customId === modalId && s.user.id === interaction.user.id,
      time: 60_000,
    })
    .catch(() => null);

  if (!submit) return false;

  const value = submit.fields.getTextInputValue("confirm").trim();
  if (value !== confirmText) {
    await submit.reply({ content: `❌ Confirmation failed. Expected \`${confirmText}\`.`, ephemeral: true });
    return false;
  }

  await submit.deferUpdate();
  return true;
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Format seconds into a human-readable uptime string.
 */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}
