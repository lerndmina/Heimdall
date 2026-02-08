/**
 * DM Templates — Variable rendering for infraction DM notifications.
 *
 * Supports both plain-text templates and embed configurations with
 * variable interpolation.
 */

import { EmbedBuilder, type User } from "discord.js";
import type { IModerationConfig } from "../models/ModerationConfig.js";
import type { IAutomodRule } from "../models/AutomodRule.js";
import { DEFAULT_DM_TEMPLATE, ACTION_COLORS } from "./constants.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("moderation:dm");

// ── Template Variables ───────────────────────────────────

export interface TemplateVars {
  user?: string;
  username?: string;
  server?: string;
  rule?: string;
  channel?: string;
  points?: number;
  totalPoints?: number;
  action?: string;
  reason?: string;
  moderator?: string;
  matchedContent?: string;
  timestamp?: string;
  duration?: string;
}

/**
 * Interpolate template variables into a string.
 * Variables use {variableName} syntax.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key as keyof TemplateVars];
    return value !== undefined && value !== null ? String(value) : `{${key}}`;
  });
}

/**
 * Build an embed from an embed config object with variable interpolation.
 */
export function renderEmbed(
  embedConfig: { title?: string; description?: string; color?: number; fields?: Array<{ name: string; value: string; inline?: boolean }> },
  vars: TemplateVars,
): EmbedBuilder {
  const embed = new EmbedBuilder();

  if (embedConfig.title) {
    embed.setTitle(renderTemplate(embedConfig.title, vars));
  }
  if (embedConfig.description) {
    embed.setDescription(renderTemplate(embedConfig.description, vars));
  }
  if (embedConfig.color !== undefined) {
    embed.setColor(embedConfig.color);
  }
  if (embedConfig.fields) {
    for (const field of embedConfig.fields) {
      embed.addFields({
        name: renderTemplate(field.name, vars),
        value: renderTemplate(field.value, vars),
        inline: field.inline ?? false,
      });
    }
  }

  embed.setTimestamp();
  return embed;
}

// ── DM Sending ───────────────────────────────────────────

interface DmConfig {
  dmOnInfraction: boolean;
  dmMode: string;
  defaultDmTemplate?: string | null;
  defaultDmEmbed?: Record<string, unknown> | null;
}

/**
 * Send an infraction notification DM to a user.
 *
 * Resolution order for DM mode:
 * 1. Per-rule override (dmMode/dmTemplate/dmEmbed)
 * 2. Config default (dmMode/defaultDmTemplate/defaultDmEmbed)
 * 3. Hardcoded default template
 *
 * Silently catches DMs-disabled errors.
 */
export async function sendInfractionDm(
  user: User,
  config: DmConfig,
  vars: TemplateVars,
  rule?: { dmMode?: string | null; dmTemplate?: string | null; dmEmbed?: Record<string, unknown> | null } | null,
): Promise<boolean> {
  if (!config.dmOnInfraction) return false;

  try {
    // Resolve DM mode: rule override → config default → "template"
    const dmMode = rule?.dmMode ?? config.dmMode ?? "template";

    if (dmMode === "embed") {
      const embedConfig = rule?.dmEmbed ?? config.defaultDmEmbed;
      if (embedConfig) {
        const embed = renderEmbed(embedConfig as any, vars);
        await user.send({ embeds: [embed] });
        return true;
      }
    }

    // Template mode (default fallback)
    const template = rule?.dmTemplate ?? config.defaultDmTemplate ?? DEFAULT_DM_TEMPLATE;
    const content = renderTemplate(template, vars);
    await user.send({ content });
    return true;
  } catch (err) {
    // Silently ignore DM-disabled errors
    const error = err as { code?: number };
    if (error.code === 50007) {
      log.debug(`Cannot DM user ${user.id} — DMs disabled`);
    } else {
      log.error(`Failed to DM user ${user.id}:`, err);
    }
    return false;
  }
}

/**
 * Format a duration in ms to a human-readable string.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
