"use client";

import { GuildProvider } from "./guild-provider";

interface GuildProviderWrapperProps {
  children: React.ReactNode;
  userId: string;
}

export function GuildProviderWrapper({ children, userId }: GuildProviderWrapperProps) {
  return <GuildProvider userId={userId}>{children}</GuildProvider>;
}
