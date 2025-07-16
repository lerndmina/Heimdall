"use client";

import { useQuery } from "@tanstack/react-query";

interface BotInfo {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

async function fetchBotInfo(): Promise<BotInfo> {
  const response = await fetch("/api/bot-info");

  if (!response.ok) {
    throw new Error("Failed to fetch bot information");
  }

  return response.json();
}

export function useBotInfo() {
  return useQuery<BotInfo>({
    queryKey: ["bot-info"],
    queryFn: fetchBotInfo,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours (renamed from cacheTime in newer versions)
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useBotName(): string {
  const { data, isLoading, error } = useBotInfo();

  // Fallback to "Heimdall" if loading, error, or no data
  if (isLoading || error || !data?.name) {
    return "Heimdall";
  }

  return data.name;
}
