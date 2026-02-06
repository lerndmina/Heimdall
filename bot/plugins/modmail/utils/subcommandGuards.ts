/**
 * Shared guard helpers for modmail subcommands.
 *
 * Each guard checks a condition, sends an error reply if it fails, and returns null.
 * On success, returns the requested resource. Callers do an early return on null.
 *
 * Usage:
 *   const config = await requireConfig(interaction, pluginAPI);
 *   if (!config) return;
 *
 *   const modmail = await requireModmailThread(interaction, pluginAPI);
 *   if (!modmail) return;
 */

import type { ChatInputCommandInteraction } from "discord.js";
import type { ModmailPluginAPI } from "../index.js";
import type { IModmailConfig } from "../models/ModmailConfig.js";
import type { IModmail } from "../models/Modmail.js";
import { ModmailEmbeds } from "./ModmailEmbeds.js";

/**
 * Require that modmail is configured for the current guild.
 * Sends an error reply and returns null if not configured.
 *
 * @param interaction - Already-deferred ChatInputCommandInteraction
 * @param pluginAPI - Modmail plugin API
 * @returns The config, or null if not configured (error already sent)
 */
export async function requireConfig(interaction: ChatInputCommandInteraction, pluginAPI: ModmailPluginAPI): Promise<IModmailConfig | null> {
  const config = await pluginAPI.modmailService.getConfig(interaction.guildId!);
  if (!config) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Not Configured", "Modmail is not configured for this server.\n\nUse `/modmail config` to get started.")],
    });
    return null;
  }
  return config;
}

/**
 * Require that the current channel is a modmail thread.
 * Sends an error reply and returns null if not a modmail thread.
 *
 * @param interaction - Already-deferred ChatInputCommandInteraction
 * @param pluginAPI - Modmail plugin API
 * @returns The modmail document, or null if not a thread (error already sent)
 */
export async function requireModmailThread(interaction: ChatInputCommandInteraction, pluginAPI: ModmailPluginAPI): Promise<IModmail | null> {
  const modmail = await pluginAPI.modmailService.getModmailByThreadId(interaction.channelId);
  if (!modmail) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Not a Modmail Thread", "This command must be used inside a modmail thread.\n\nNavigate to a modmail forum thread and try again.")],
    });
    return null;
  }
  return modmail;
}
