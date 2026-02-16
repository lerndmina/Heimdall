"use client";

import { useEffect } from "react";
import { useWebSocket } from "@/lib/websocket";

/**
 * Subscribe to a global (non-guild-scoped) WebSocket event.
 * Used for owner-only events like migration progress that aren't tied to a specific guild.
 */
export function useOwnerEvent(event: string, handler: (data: any) => void): void {
  const { subscribeGlobal } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribeGlobal(event, handler);
    return unsubscribe;
  }, [event, handler, subscribeGlobal]);
}
