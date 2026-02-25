/**
 * DiscordMention — renders a Discord-styled role or channel mention pill.
 *
 * Resolves IDs to names via the guild roles/channels API, with a
 * module-level cache so repeated mentions in the same page load
 * only trigger one fetch per guild per type.
 *
 * Usage:
 *   <DiscordMention type="role"    id={roleId}    guildId={guildId} />
 *   <DiscordMention type="channel" id={channelId} guildId={guildId} />
 */
"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

// ── Cached data types ──────────────────────────────────────────

interface RoleData {
  id: string;
  name: string;
  color: number; // decimal integer from Discord
  position: number;
}

interface ChannelData {
  id: string;
  name: string;
}

// ── Module-level caches ────────────────────────────────────────
// Keyed by guildId. Populated on first use and reused for the session.

const roleCache = new Map<string, RoleData[]>();
const channelCache = new Map<string, ChannelData[]>();
const pendingRoles = new Map<string, Promise<void>>();
const pendingChannels = new Map<string, Promise<void>>();

function ensureRoles(guildId: string): Promise<void> {
  if (roleCache.has(guildId)) return Promise.resolve();
  if (!pendingRoles.has(guildId)) {
    const p = fetchApi<{ roles: RoleData[] }>(guildId, "roles?includeEveryone=true", {
      cacheKey: `discord-mention-roles-${guildId}`,
      cacheTtl: 60_000,
    }).then((res) => {
      if (res.success && res.data) roleCache.set(guildId, res.data.roles);
    });
    pendingRoles.set(guildId, p);
  }
  return pendingRoles.get(guildId)!;
}

function ensureChannels(guildId: string): Promise<void> {
  if (channelCache.has(guildId)) return Promise.resolve();
  if (!pendingChannels.has(guildId)) {
    const p = fetchApi<{ channels: ChannelData[] }>(guildId, "channels?type=text", {
      cacheKey: `discord-mention-channels-${guildId}`,
      cacheTtl: 60_000,
    }).then((res) => {
      if (res.success && res.data) channelCache.set(guildId, res.data.channels);
    });
    pendingChannels.set(guildId, p);
  }
  return pendingChannels.get(guildId)!;
}

// ── Component ──────────────────────────────────────────────────

interface DiscordMentionProps {
  type: "role" | "channel";
  id: string;
  guildId: string;
}

export default function DiscordMention({ type, id, guildId }: DiscordMentionProps) {
  const [resolved, setResolved] = useState<{ name: string; color?: number } | null>(null);

  useEffect(() => {
    if (!id || !guildId) return;

    if (type === "role") {
      ensureRoles(guildId).then(() => {
        const role = roleCache.get(guildId)?.find((r) => r.id === id);
        setResolved(role ? { name: role.name, color: role.color } : null);
      });
    } else {
      ensureChannels(guildId).then(() => {
        const ch = channelCache.get(guildId)?.find((c) => c.id === id);
        setResolved(ch ? { name: ch.name } : null);
      });
    }
  }, [type, id, guildId]);

  // ── Loading / unknown fallback ─────────────────────────────
  if (!resolved) {
    return (
      <span className="inline-flex cursor-default items-center rounded bg-ui-bg-subtle px-1.5 py-0.5 font-mono text-xs font-medium text-ui-text-muted" title={`ID: ${id}`}>
        {type === "channel" ? "#" : "@"}
        {id.slice(-6)}…
      </span>
    );
  }

  // ── Role pill ──────────────────────────────────────────────
  if (type === "role") {
    const hasColor = resolved.color && resolved.color > 0;
    const hex = hasColor ? `#${resolved.color!.toString(16).padStart(6, "0")}` : null;

    return (
      <span
        className="inline-flex cursor-default items-center rounded border px-1.5 py-0.5 text-xs font-semibold transition-colors"
        style={
          hex
            ? {
                color: hex,
                backgroundColor: `${hex}26`, // color at ~15% opacity
                borderColor: `${hex}55`,
              }
            : {
                color: "#b5bac1",
                backgroundColor: "rgba(181,186,193,0.15)",
                borderColor: "rgba(181,186,193,0.3)",
              }
        }
        title={`Role ID: ${id}`}>
        @{resolved.name}
      </span>
    );
  }

  // ── Channel pill ───────────────────────────────────────────
  return (
    <span
      className="inline-flex cursor-default items-center rounded border border-indigo-400/30 bg-indigo-400/15 px-1.5 py-0.5 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-400/25"
      title={`Channel ID: ${id}`}>
      #{resolved.name}
    </span>
  );
}
