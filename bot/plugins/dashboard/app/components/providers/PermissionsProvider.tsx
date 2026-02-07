/**
 * PermissionsProvider — React context that provides the current user's
 * resolved dashboard permissions to all child components.
 */
"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface PermissionsContextValue {
  /** Resolved permission map: action key → boolean */
  permissions: Record<string, boolean>;
  /** Whether inaccessible sidebar items should be hidden vs grayed out */
  hideDeniedFeatures: boolean;
  /** Whether the current user is the guild owner */
  isOwner: boolean;
  /** Whether the current user has Discord Administrator */
  isAdministrator: boolean;
  /** Whether permissions have been loaded */
  loaded: boolean;
  /** Force refresh permissions from the server */
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within a PermissionsProvider");
  return ctx;
}

interface PermissionsProviderProps {
  guildId: string;
  children: ReactNode;
}

export default function PermissionsProvider({ guildId, children }: PermissionsProviderProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [hideDeniedFeatures, setHideDeniedFeatures] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/guilds/${guildId}/user-permissions`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setPermissions(json.data.permissions ?? {});
        setHideDeniedFeatures(json.data.hideDeniedFeatures ?? false);
        setIsOwner(json.data.isOwner ?? false);
        setIsAdministrator(json.data.isAdministrator ?? false);
      }
    } catch {
      // Silently fail — user will see default (no permissions)
    } finally {
      setLoaded(true);
    }
  }, [guildId]);

  // Load on first render
  useEffect(() => {
    refresh();
  }, [refresh]);

  return <PermissionsContext.Provider value={{ permissions, hideDeniedFeatures, isOwner, isAdministrator, loaded, refresh }}>{children}</PermissionsContext.Provider>;
}
