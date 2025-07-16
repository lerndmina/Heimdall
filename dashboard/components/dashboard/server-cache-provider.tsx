"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { apiClient } from "@/lib/api";

interface Guild {
  id: string;
  name: string;
  icon?: string;
  permissions: string[];
  hasModmail: boolean;
}

interface ServerCacheContextType {
  servers: Guild[];
  isLoading: boolean;
  error: string | null;
  refreshServers: () => Promise<void>;
  getServerById: (id: string) => Guild | undefined;
  checkServerPermissions: (id: string) => Promise<boolean>;
  initializeCache: (userId: string) => Promise<void>;
}

const ServerCacheContext = createContext<ServerCacheContextType | undefined>(undefined);

interface ServerCacheProviderProps {
  children: ReactNode;
  userId?: string;
}

export function ServerCacheProvider({ children, userId }: ServerCacheProviderProps) {
  const [servers, setServers] = useState<Guild[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(userId);
  const isInitializingRef = useRef(false);

  const loadServersFromAPI = useCallback(async (targetUserId: string) => {
    try {
      const response = await apiClient.validateUser(targetUserId);
      const guilds = (response as any)?.data?.guilds || [];

      // Transform to our format
      const serverList: Guild[] = guilds
        .filter((guild: any) => guild.hasStaffRole)
        .map((guild: any) => ({
          id: guild.guildId,
          name: guild.guildName,
          icon: guild.guildIcon,
          permissions: [], // Would need to be populated from API
          hasModmail: true, // Assume true if they have staff role
        }));

      setServers(serverList);

      // Update cache
      const cacheKey = `heimdall-servers-cache-${targetUserId}`;
      const cacheTimeKey = `heimdall-servers-cache-time-${targetUserId}`;
      localStorage.setItem(cacheKey, JSON.stringify(serverList));
      localStorage.setItem(cacheTimeKey, Date.now().toString());
    } catch (error) {
      console.error("Failed to fetch servers from API:", error);
      throw error;
    }
  }, []);

  const loadServers = useCallback(
    async (userIdToUse?: string) => {
      const targetUserId = userIdToUse || currentUserId;
      if (!targetUserId) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Check cache first
        const cacheKey = `heimdall-servers-cache-${targetUserId}`;
        const cacheTimeKey = `heimdall-servers-cache-time-${targetUserId}`;
        const cached = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheTimeKey);

        // Use cache if it's less than 5 minutes old
        if (cached && cacheTime) {
          const age = Date.now() - parseInt(cacheTime);
          if (age < 5 * 60 * 1000) {
            // 5 minutes
            setServers(JSON.parse(cached));
            setIsLoading(false);
            // Continue loading in background to update cache
            loadServersFromAPI(targetUserId);
            return;
          }
        }

        // Load from API
        await loadServersFromAPI(targetUserId);
      } catch (error) {
        console.error("Failed to load servers:", error);
        setError("Failed to load servers");
      } finally {
        setIsLoading(false);
      }
    },
    [currentUserId, loadServersFromAPI]
  );

  const refreshServers = useCallback(async () => {
    if (!currentUserId) return;

    // Clear cache
    const cacheKey = `heimdall-servers-cache-${currentUserId}`;
    const cacheTimeKey = `heimdall-servers-cache-time-${currentUserId}`;
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(cacheTimeKey);
    await loadServers();
  }, [currentUserId, loadServers]);

  const initializeCache = useCallback(
    async (newUserId: string) => {
      // Prevent multiple simultaneous initializations
      if (isInitializingRef.current) {
        return;
      }

      isInitializingRef.current = true;
      setCurrentUserId(newUserId);

      // Directly load servers for the new user ID to avoid race conditions
      if (newUserId) {
        try {
          setIsLoading(true);
          setError(null);

          // Check cache first
          const cacheKey = `heimdall-servers-cache-${newUserId}`;
          const cacheTimeKey = `heimdall-servers-cache-time-${newUserId}`;
          const cached = localStorage.getItem(cacheKey);
          const cacheTime = localStorage.getItem(cacheTimeKey);

          // Use cache if it's less than 5 minutes old
          if (cached && cacheTime) {
            const age = Date.now() - parseInt(cacheTime);
            if (age < 5 * 60 * 1000) {
              // 5 minutes
              setServers(JSON.parse(cached));
              setIsLoading(false);
              isInitializingRef.current = false;
              // Continue loading in background to update cache
              loadServersFromAPI(newUserId).finally(() => {
                isInitializingRef.current = false;
              });
              return;
            }
          }

          // Load from API
          await loadServersFromAPI(newUserId);
        } catch (error) {
          console.error("Failed to load servers:", error);
          setError("Failed to load servers");
        } finally {
          setIsLoading(false);
          isInitializingRef.current = false;
        }
      } else {
        isInitializingRef.current = false;
      }
    },
    [loadServersFromAPI]
  );

  const getServerById = useCallback(
    (id: string): Guild | undefined => {
      return servers.find((server) => server.id === id);
    },
    [servers]
  );

  const checkServerPermissions = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        // Check if server exists in our cached list first
        const server = getServerById(id);
        if (!server) {
          return false;
        }

        // For now, assume if it's in our list, user has permissions
        // In production, you might want to do an additional API call
        // to verify current permissions on the specific server
        return server.hasModmail;
      } catch (error) {
        console.error("Failed to check server permissions:", error);
        return false;
      }
    },
    [getServerById]
  );

  // Load servers on mount if currentUserId is already available (but not when set by initializeCache)
  useEffect(() => {
    if (currentUserId && userId) {
      // Only run if userId prop was provided initially
      loadServers();
    }
  }, []); // Empty dependency array - only run once on mount

  const value: ServerCacheContextType = {
    servers,
    isLoading,
    error,
    refreshServers,
    getServerById,
    checkServerPermissions,
    initializeCache,
  };

  return <ServerCacheContext.Provider value={value}>{children}</ServerCacheContext.Provider>;
}

export function useServerCache() {
  const context = useContext(ServerCacheContext);
  if (context === undefined) {
    throw new Error("useServerCache must be used within a ServerCacheProvider");
  }
  return context;
}
