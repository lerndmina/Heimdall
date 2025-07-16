"use client";

import { useSearchParams } from "next/navigation";
import { GuildProvider } from "./guild-provider";

interface GuildProviderWrapperProps {
  children: React.ReactNode;
  userId: string;
}

export function GuildProviderWrapper({ children, userId }: GuildProviderWrapperProps) {
  const searchParams = useSearchParams();
  const guildId = searchParams.get("guild");

  return (
    <GuildProvider userId={userId} initialGuildId={guildId || undefined}>
      {children}
    </GuildProvider>
  );
}
