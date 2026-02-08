/**
 * RoleCombobox — reusable Discord role picker.
 *
 * Fetches guild roles from the bot API.
 * Displays roles sorted by position.
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import Combobox, { type ComboboxOption } from "@/components/ui/Combobox";
import { fetchApi } from "@/lib/api";

interface RoleData {
  id: string;
  name: string;
  color: number;
  position: number;
}

interface RoleComboboxProps {
  guildId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  label?: string;
  description?: string;
  /** Role IDs to exclude from the list (e.g., already selected roles) */
  excludeIds?: string[];
}

export default function RoleCombobox({
  guildId,
  value,
  onChange,
  placeholder,
  disabled,
  error,
  label,
  description,
  excludeIds = [],
}: RoleComboboxProps) {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchApi<{ roles: RoleData[] }>(guildId, "roles", {
      cacheKey: `roles-${guildId}`,
      cacheTtl: 60_000,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) setRoles(res.data.roles);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const options: ComboboxOption[] = useMemo(() => {
    const excludeSet = new Set(excludeIds);
    return roles
      .filter((r) => r.name !== "@everyone" && !excludeSet.has(r.id))
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        value: r.id,
        label: `@${r.name}`,
      }));
  }, [roles, excludeIds]);

  return (
    <div className="space-y-1.5">
      {label && <p className="block text-sm font-medium text-zinc-200">{label}</p>}
      {description && <p className="text-xs text-zinc-500">{description}</p>}
      <Combobox
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "Select a role…"}
        searchPlaceholder="Search roles…"
        emptyMessage="No roles found."
        loading={loading}
        disabled={disabled}
        error={error}
      />
    </div>
  );
}
