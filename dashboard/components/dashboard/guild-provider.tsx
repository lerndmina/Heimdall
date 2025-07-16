"use client";

import { useState, createContext, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

interface Guild {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  hasStaffRole: boolean;
}

interface GuildContextType {
  guilds: Guild[];
  selectedGuild: Guild | null;
  setSelectedGuild: (guild: Guild | null) => void;
  isLoading: boolean;
  error: Error | null;
}

const GuildContext = createContext<GuildContextType | undefined>(undefined);

const SELECTED_GUILD_KEY = "heimdall-selected-guild";

export function GuildProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);

  const {
    data: userAccess,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user-access", userId],
    queryFn: () => apiClient.validateUser(userId),
  });

  const guilds = (userAccess as any)?.data?.guilds?.filter((guild: any) => guild.hasStaffRole) || [];

  // Custom setSelectedGuild that also saves to sessionStorage
  const handleSetSelectedGuild = (guild: Guild | null) => {
    setSelectedGuild(guild);
    if (guild) {
      sessionStorage.setItem(SELECTED_GUILD_KEY, guild.guildId);
    } else {
      sessionStorage.removeItem(SELECTED_GUILD_KEY);
    }
  };

  useEffect(() => {
    if (guilds.length > 0) {
      // Try to restore from sessionStorage first
      const savedGuildId = sessionStorage.getItem(SELECTED_GUILD_KEY);
      if (savedGuildId) {
        const savedGuild = guilds.find((guild: any) => guild.guildId === savedGuildId);
        if (savedGuild) {
          setSelectedGuild(savedGuild);
          return;
        }
      }

      // Otherwise, select the first guild if none is selected
      if (!selectedGuild) {
        handleSetSelectedGuild(guilds[0]);
      }
    }
  }, [guilds, selectedGuild]);

  const value: GuildContextType = {
    guilds,
    selectedGuild,
    setSelectedGuild: handleSetSelectedGuild,
    isLoading,
    error: error as Error | null,
  };

  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

export function useGuild() {
  const context = useContext(GuildContext);
  if (context === undefined) {
    throw new Error("useGuild must be used within a GuildProvider");
  }
  return context;
}
