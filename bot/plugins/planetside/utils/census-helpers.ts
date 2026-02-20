/**
 * Census helpers — Faction names, server names, formatting utilities
 */

// ── Faction data ───────────────────────────────────────────────

export const FACTION_NAMES: Record<number, string> = {
  0: "No Faction",
  1: "Vanu Sovereignty",
  2: "New Conglomerate",
  3: "Terran Republic",
  4: "NSO",
};

export const FACTION_SHORT: Record<number, string> = {
  0: "None",
  1: "VS",
  2: "NC",
  3: "TR",
  4: "NSO",
};

export const FACTION_COLORS: Record<number, number> = {
  0: 0x808080,
  1: 0x8a2be2, // purple
  2: 0x2196f3, // blue
  3: 0xf44336, // red
  4: 0x9e9e9e, // grey
};

export const FACTION_EMOJI: Record<number, string> = {
  0: "❓",
  1: "🟣", // VS
  2: "🔵", // NC
  3: "🔴", // TR
  4: "⚪", // NSO
};

// ── Server data ────────────────────────────────────────────────

export const SERVER_NAMES: Record<number, string> = {
  1: "Connery",
  10: "Miller",
  13: "Cobalt",
  17: "Emerald",
  40: "SolTech",
};

export const SERVER_REGIONS: Record<number, string> = {
  1: "US West",
  10: "EU",
  13: "EU",
  17: "US East",
  40: "Asia",
};

// ── Formatting helpers ─────────────────────────────────────────

export function getFactionName(factionId: number): string {
  return FACTION_NAMES[factionId] ?? "Unknown";
}

export function getFactionShort(factionId: number): string {
  return FACTION_SHORT[factionId] ?? "?";
}

export function getFactionColor(factionId: number): number {
  return FACTION_COLORS[factionId] ?? 0x808080;
}

export function getFactionEmoji(factionId: number): string {
  return FACTION_EMOJI[factionId] ?? "❓";
}

export function getServerName(worldId: number): string {
  return SERVER_NAMES[worldId] ?? `World ${worldId}`;
}

export function getServerRegion(worldId: number): string {
  return SERVER_REGIONS[worldId] ?? "Unknown";
}

/** Format playtime from minutes to a human-readable string */
export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

/** Format large numbers with commas */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Create a progress bar string */
export function progressBar(value: number, max: number, length: number = 10): string {
  const ratio = Math.min(value / max, 1);
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/** Format a faction breakdown as a compact summary */
export function formatPopulationBreakdown(vs: number, nc: number, tr: number, ns: number): string {
  const total = vs + nc + tr + ns;
  if (total === 0) return "No players online";

  const pct = (n: number) => ((n / total) * 100).toFixed(1);
  return [
    `${FACTION_EMOJI[1]} VS: **${vs}** (${pct(vs)}%)`,
    `${FACTION_EMOJI[2]} NC: **${nc}** (${pct(nc)}%)`,
    `${FACTION_EMOJI[3]} TR: **${tr}** (${pct(tr)}%)`,
    `${FACTION_EMOJI[4]} NSO: **${ns}** (${pct(ns)}%)`,
  ].join("\n");
}

/** Calculate Battle Rank display string including prestige */
export function formatBattleRank(battleRank: number, prestige: number): string {
  if (prestige > 0) {
    return `ASP ${prestige} — BR ${battleRank}`;
  }
  return `BR ${battleRank}`;
}
