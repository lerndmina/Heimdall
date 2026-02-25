/**
 * RoleCombobox — reusable Discord role picker.
 *
 * Fetches guild roles from the bot API.
 * Displays roles sorted by position.
 */
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Combobox, { type ComboboxOption } from "@/components/ui/Combobox";
import { fetchApi } from "@/lib/api";
import { cache } from "@/lib/cache";

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
  /** Include @everyone in the list (default: true) */
  includeEveryone?: boolean;
}

export default function RoleCombobox({ guildId, value, onChange, placeholder, disabled, error, label, description, excludeIds = [], includeEveryone = true }: RoleComboboxProps) {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(true);

  const cacheKey = `roles-${guildId}-${includeEveryone ? "all" : "no-everyone"}`;

  const fetchRoles = useCallback(
    (bustCache = false) => {
      setLoading(true);
      if (bustCache) cache.invalidate(cacheKey);

      const query = includeEveryone ? "roles?includeEveryone=true" : "roles";
      fetchApi<{ roles: RoleData[] }>(guildId, query, {
        cacheKey,
        cacheTtl: 60_000,
      })
        .then((res) => {
          if (res.success && res.data) setRoles(res.data.roles);
        })
        .finally(() => setLoading(false));
    },
    [guildId, cacheKey],
  );

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const options: ComboboxOption[] = useMemo(() => {
    const excludeSet = new Set(excludeIds);
    return roles
      .filter((r) => !excludeSet.has(r.id))
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        value: r.id,
        label: `@${r.name}`,
      }));
  }, [roles, excludeIds]);

  return (
    <div className="space-y-1.5">
      {label && <p className="block text-sm font-medium text-ui-text-primary">{label}</p>}
      {description && <p className="text-xs text-ui-text-faint">{description}</p>}
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
        onRefresh={() => fetchRoles(true)}
      />
    </div>
  );
}
