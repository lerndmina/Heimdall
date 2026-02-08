/**
 * Presets — Built-in automod rule presets (disabled by default).
 *
 * Enabling a preset creates a mutable copy of the rule that the guild can
 * freely customise. Disabling deletes it. Re-enabling starts fresh.
 */

import { AutomodTarget, AutomodAction } from "../models/AutomodRule.js";

export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  target: string;
  patterns: Array<{ regex: string; flags: string; label: string }>;
  matchMode: "any" | "all";
  actions: string[];
  warnPoints: number;
}

export const PRESETS: PresetDefinition[] = [
  {
    id: "invite-links",
    name: "Invite Links",
    description: "Block Discord invite links (discord.gg, discordapp.com/invite)",
    target: AutomodTarget.LINK,
    patterns: [{ regex: "(?:discord\\.gg|discordapp\\.com\\/invite|discord\\.com\\/invite)\\/[\\w-]+", flags: "i", label: "Discord invite URL" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 2,
  },
  {
    id: "mass-mention",
    name: "Mass Mention",
    description: "Detect messages with 5 or more user/role mentions",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [
      { regex: "(<@!?\\d+>.*){5,}", flags: "s", label: "5+ user mentions" },
      { regex: "(<@&\\d+>.*){5,}", flags: "s", label: "5+ role mentions" },
    ],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 3,
  },
  {
    id: "excessive-caps",
    name: "Excessive Caps",
    description: "Detect messages with 70%+ uppercase characters (minimum 10 chars)",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [{ regex: "(?=.{10,})(?:[^A-Za-z]*[A-Z]){7}[^a-z]*$", flags: "", label: "70%+ uppercase" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "repeated-text",
    name: "Repeated Characters",
    description: "Detect messages with 10+ repeated characters in a row",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [{ regex: "(.)\\1{9,}", flags: "", label: "10+ repeated chars" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "external-links",
    name: "External Links",
    description: "Block all non-Discord links",
    target: AutomodTarget.LINK,
    patterns: [{ regex: "https?:\\/\\/(?!(?:discord\\.gg|discord\\.com|discordapp\\.com|cdn\\.discordapp\\.com|media\\.discordapp\\.net))[^\\s]+", flags: "i", label: "Non-Discord URL" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
  {
    id: "zalgo-text",
    name: "Zalgo Text",
    description: "Detect messages containing zalgo (combining character abuse)",
    target: AutomodTarget.MESSAGE_CONTENT,
    patterns: [{ regex: "[\\u0300-\\u036f\\u0489]{3,}", flags: "", label: "Zalgo combining chars" }],
    matchMode: "any",
    actions: [AutomodAction.DELETE, AutomodAction.WARN, AutomodAction.LOG],
    warnPoints: 1,
  },
];

/**
 * Get a preset by its ID.
 */
export function getPreset(presetId: string): PresetDefinition | undefined {
  return PRESETS.find((p) => p.id === presetId);
}

/**
 * Get all presets.
 */
export function getAllPresets(): PresetDefinition[] {
  return PRESETS;
}
