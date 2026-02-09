"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useWebSocket } from "@/lib/websocket";

export function useRealtimeEvent(event: string, handler: (data: any) => void): void {
  const { guildId } = useParams<{ guildId: string }>();
  const { subscribe, joinGuild, leaveGuild } = useWebSocket();

  useEffect(() => {
    if (!guildId) return;
    joinGuild(guildId);
    const unsubscribe = subscribe(guildId, event, handler);
    return () => {
      unsubscribe();
      leaveGuild(guildId);
    };
  }, [guildId, event, handler, subscribe, joinGuild, leaveGuild]);
}
