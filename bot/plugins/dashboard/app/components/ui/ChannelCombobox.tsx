/**
 * ChannelCombobox — reusable Discord channel picker.
 *
 * Fetches guild channels from the bot API with configurable type filter.
 * Displays channels grouped by category.
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
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  label?: string;
  description?: string;
}

export default function ChannelCombobox({ guildId, value, onChange, channelType = "text", placeholder, disabled, error, label, description }: ChannelComboboxProps) {
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [loading, setLoading] = useState(true);

  const cacheKey = `channels-${guildId}-${channelType}`;

  const fetchChannels = useCallback(
    (bustCache = false) => {
      setLoading(true);
      if (bustCache) cache.invalidate(cacheKey);

      fetchApi<{ channels: ChannelData[] }>(guildId, `channels?type=${channelType}`, {
        cacheKey,
        cacheTtl: 60_000,
      })
        .then((res) => {
          if (res.success && res.data) {
            setChannels(res.data.channels);
          }
        })
        .finally(() => setLoading(false));
    },
    [guildId, channelType, cacheKey],
  );

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const options: ComboboxOption[] = useMemo(() => {
    return channels.map((ch) => ({
      value: ch.id,
      label: ch.category ? `#${ch.name} (${ch.category})` : `#${ch.name}`,
    }));
  }, [channels]);

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
