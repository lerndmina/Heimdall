/**
 * ChannelCombobox — reusable Discord channel picker.
 *
 * Fetches guild channels from the bot API with configurable type filter.
 * Displays channels grouped by category with channel-type icons.
 */
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Combobox, { type ComboboxOption } from "@/components/ui/Combobox";
import { fetchApi } from "@/lib/api";
import { cache } from "@/lib/cache";

interface ChannelData {
  id: string;
  name: string;
  type: number;
  category: string | null;
  categoryId: string | null;
}

interface ChannelComboboxProps {
  guildId: string;
  value: string;
  onChange: (value: string) => void;
  /** Channel type filter: "text" | "voice" | "category" | "forum" | "all" (default: "text") */
  channelType?: "text" | "voice" | "category" | "forum" | "all";
  /**
   * When true, filters out forum channels (Discord type 15) from the options.
   * Use this wherever only normal text channels are valid targets
   * (e.g. posting messages, logging, welcome, reminders).
   * Leave false for monitoring/blocking features that also cover forum channels.
   */
  excludeForums?: boolean;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  label?: string;
  description?: string;
}

/** Discord channel type 15 = GuildForum */
const FORUM_CHANNEL_TYPE = 15;

/** Small icon representing a Discord channel type, used as the option prefix. */
function ChannelTypeIcon({ type }: { type: number }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-zinc-400";

  // Forum (15) — speech-bubble with lines
  if (type === FORUM_CHANNEL_TYPE) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        <line x1="9" y1="10" x2="15" y2="10" />
        <line x1="9" y1="14" x2="13" y2="14" />
      </svg>
    );
  }

  // Announcement (5) — megaphone
  if (type === 5) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    );
  }

  // Threads (10 = AnnouncementThread, 11 = PublicThread, 12 = PrivateThread) — reply arrow
  if (type === 10 || type === 11 || type === 12) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 3 12 9 6" />
        <path d="M3 12h18" />
      </svg>
    );
  }

  // Voice (2), Stage (13) — speaker
  if (type === 2 || type === 13) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
      </svg>
    );
  }

  // Category (4) — folder
  if (type === 4) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      </svg>
    );
  }

  // Default: text channel — hashtag
  return <span className="text-xs font-bold text-zinc-400 leading-none">#</span>;
}

const channelDataCache = new Map<string, ChannelData[]>();
const pendingChannelFetches = new Map<string, Promise<ChannelData[]>>();

function getSharedCacheKey(guildId: string, channelType: ChannelComboboxProps["channelType"]): string {
  return `channels-${guildId}-${channelType ?? "text"}`;
}

async function loadChannelsShared(guildId: string, channelType: NonNullable<ChannelComboboxProps["channelType"]>, forceRefresh = false): Promise<ChannelData[]> {
  const cacheKey = getSharedCacheKey(guildId, channelType);

  if (forceRefresh) {
    cache.invalidate(cacheKey);
    channelDataCache.delete(cacheKey);
    pendingChannelFetches.delete(cacheKey);
  }

  const inMemory = channelDataCache.get(cacheKey);
  if (inMemory) return inMemory;

  const pending = pendingChannelFetches.get(cacheKey);
  if (pending) return pending;

  const request = fetchApi<{ channels: ChannelData[] }>(guildId, `channels?type=${channelType}`, {
    cacheKey,
    cacheTtl: 60_000,
  })
    .then((res) => {
      const next = res.success && res.data ? res.data.channels : [];
      channelDataCache.set(cacheKey, next);
      return next;
    })
    .finally(() => {
      pendingChannelFetches.delete(cacheKey);
    });

  pendingChannelFetches.set(cacheKey, request);
  return request;
}

export default function ChannelCombobox({ guildId, value, onChange, channelType = "text", excludeForums = false, placeholder, disabled, error, label, description }: ChannelComboboxProps) {
  const cacheKey = getSharedCacheKey(guildId, channelType);
  const [channels, setChannels] = useState<ChannelData[]>(() => channelDataCache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !channelDataCache.has(cacheKey));

  const fetchChannels = useCallback(
    async (bustCache = false) => {
      const hasImmediateData = channelDataCache.has(cacheKey);
      setLoading(!hasImmediateData || bustCache);

      const next = await loadChannelsShared(guildId, channelType, bustCache);
      setChannels(next);
      setLoading(false);
    },
    [guildId, channelType, cacheKey],
  );

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const options: ComboboxOption[] = useMemo(() => {
    const visible = excludeForums ? channels.filter((ch) => ch.type !== FORUM_CHANNEL_TYPE) : channels;
    return visible.map((ch) => ({
      value: ch.id,
      label: ch.category ? `${ch.name} (${ch.category})` : ch.name,
      prefix: <ChannelTypeIcon type={ch.type} />,
    }));
  }, [channels, excludeForums]);

  return (
    <div className="space-y-1.5">
      {label && <p className="block text-sm font-medium text-zinc-200">{label}</p>}
      {description && <p className="text-xs text-zinc-500">{description}</p>}
      <Combobox
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "Select a channel…"}
        searchPlaceholder="Search channels…"
        emptyMessage="No channels found."
        loading={loading}
        disabled={disabled}
        error={error}
        onRefresh={() => fetchChannels(true)}
      />
    </div>
  );
}
