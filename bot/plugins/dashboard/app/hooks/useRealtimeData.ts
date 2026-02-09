"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { cache } from "@/lib/cache";
import { useWebSocket } from "@/lib/websocket";

interface UseRealtimeDataOptions<T> {
  path: string;
  events: string[];
  cacheKey?: string;
  skip?: boolean;
  onEvent?: (event: string, data: any, current: T | null) => T | "refetch";
}

export function useRealtimeData<T>({ path, events, cacheKey, skip, onEvent }: UseRealtimeDataOptions<T>) {
  const { guildId } = useParams<{ guildId: string }>();
  const { subscribe, joinGuild, leaveGuild } = useWebSocket();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<T | null>(null);

  const fetchData = useCallback(async () => {
    if (!guildId || skip) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<T>(guildId, path, { skipCache: true });
      if (result.success && result.data != null) {
        setData(result.data);
        dataRef.current = result.data;
        if (cacheKey) cache.set(cacheKey, result.data);
      } else {
        setError(result.error?.message || "Failed to fetch data");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [guildId, path, skip, cacheKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!guildId) return;
    joinGuild(guildId);
    return () => leaveGuild(guildId);
  }, [guildId, joinGuild, leaveGuild]);

  useEffect(() => {
    if (!guildId) return;

    const unsubscribers = events.map((event) =>
      subscribe(guildId, event, (eventData) => {
        if (onEvent) {
          const result = onEvent(event, eventData, dataRef.current);
          if (result === "refetch") {
            void fetchData();
          } else {
            setData(result);
            dataRef.current = result;
            if (cacheKey) cache.set(cacheKey, result);
          }
        } else {
          void fetchData();
        }

        if (cacheKey) cache.invalidate(cacheKey);
      }),
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [guildId, events, subscribe, onEvent, fetchData, cacheKey]);

  return { data, loading, error, refetch: fetchData, setData };
}
