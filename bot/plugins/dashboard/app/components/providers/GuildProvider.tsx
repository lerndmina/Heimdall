/**
 * GuildProvider — React context that provides the current guild info
 * and a scoped API fetcher to all child components.
 */
"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
}

interface GuildContextValue {
  guild: GuildInfo;
}

const GuildContext = createContext<GuildContextValue | null>(null);

export function useGuild(): GuildContextValue {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error("useGuild must be used within a GuildProvider");
  return ctx;
}

export default function GuildProvider({ guild, children }: { guild: GuildInfo; children: ReactNode }) {
  return <GuildContext.Provider value={{ guild }}>{children}</GuildContext.Provider>;
}
