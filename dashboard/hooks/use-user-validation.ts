"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

interface UserValidationResult {
  data: {
    userId: string;
    isStaff: boolean;
    guilds: Array<{
      guildId: string;
      guildName: string;
      guildIcon: string | null;
      hasStaffRole: boolean;
    }>;
  };
}

/**
 * Shared hook for user validation to prevent duplicate API calls
 * This hook should be used instead of calling apiClient.validateUser directly
 * in React components to avoid rate limiting issues.
 */
export function useUserValidation(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-validation", userId],
    queryFn: () => {
      if (!userId) {
        throw new Error("User ID is required");
      }
      return apiClient.validateUser(userId) as Promise<UserValidationResult>;
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 minutes - user access doesn't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes garbage collection time
    retry: (failureCount, error: any) => {
      // Don't retry on 429 (rate limiting) or 403/401 (auth errors)
      if (error?.status === 429 || error?.status === 403 || error?.status === 401) {
        console.warn(`User validation failed for ${userId}:`, error?.status, error?.message);
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    refetchOnReconnect: false, // Prevent refetch on reconnect
    refetchInterval: false, // Don't automatically refetch
  });
}

/**
 * Helper to get just the staff guilds from user validation
 */
export function useStaffGuilds(userId: string | undefined) {
  const { data, isLoading, error } = useUserValidation(userId);
  
  const staffGuilds = data?.data?.guilds?.filter(guild => guild.hasStaffRole) || [];
  
  return {
    guilds: staffGuilds,
    isLoading,
    error,
  };
}
