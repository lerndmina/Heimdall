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

  const guilds = userAccess?.guilds?.filter((guild) => guild.hasStaffRole) || [];

  useEffect(() => {
    if (guilds.length > 0 && !selectedGuild) {
      setSelectedGuild(guilds[0]);
    }
  }, [guilds, selectedGuild]);

  const value: GuildContextType = {
    guilds,
    selectedGuild,
    setSelectedGuild,
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
