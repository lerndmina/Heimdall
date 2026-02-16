"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { fetchRuntimeConfig } from "./runtimeConfig";

interface WebSocketContextValue {
  connected: boolean;
  subscribe: (guildId: string, event: string, handler: (data: any) => void) => () => void;
  subscribeGlobal: (event: string, handler: (data: any) => void) => () => void;
  joinGuild: (guildId: string) => void;
  leaveGuild: (guildId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  connected: false,
  subscribe: () => () => {},
  subscribeGlobal: () => () => {},
  joinGuild: () => {},
  leaveGuild: () => {},
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const accessToken = session?.accessToken;
  const [connected, setConnected] = useState(false);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const globalListenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const subscribedGuildsRef = useRef<Map<string, number>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    const resolveConfig = async () => {
      const config = await fetchRuntimeConfig();
      if (cancelled) return;
      const fallback = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002";
      setWsUrl(config?.wsUrl ?? fallback);
    };

    resolveConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(() => {
    if (!accessToken || !wsUrl) return;

    const currentSocket = wsRef.current;
    if (currentSocket && (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    shouldReconnectRef.current = true;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: "auth", token: accessToken }));
    };

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.event === "authenticated") {
        setConnected(true);
        for (const [guildId, count] of subscribedGuildsRef.current.entries()) {
          if (count > 0) {
            ws.send(JSON.stringify({ type: "subscribe", guildId }));
          }
        }
        return;
      }

      if (msg.event === "error") {
        const code = msg?.data?.code as string | undefined;
        if (code === "INVALID_TOKEN" || code === "MISSING_TOKEN" || code === "NOT_AUTHENTICATED" || code === "TOO_MANY_CONNECTIONS") {
          shouldReconnectRef.current = false;
          setConnected(false);
          ws.close(4001, code);
          return;
        }
      }

      // Handle global (non-guild-scoped) events — e.g., owner-only migration progress
      if (!msg.guildId && msg.event) {
        const globalHandlers = globalListenersRef.current.get(msg.event);
        if (globalHandlers) {
          for (const handler of globalHandlers) {
            handler(msg.data);
          }
        }
        return;
      }

      if (!msg.guildId || !msg.event) return;

      const key = `${msg.guildId}:${msg.event}`;
      const handlers = listenersRef.current.get(key);
      if (handlers) {
        for (const handler of handlers) {
          handler(msg.data);
        }
      }

      const wildcardKey = `${msg.guildId}:*`;
      const wildcardHandlers = listenersRef.current.get(wildcardKey);
      if (wildcardHandlers) {
        for (const handler of wildcardHandlers) {
          handler({ event: msg.event, data: msg.data });
        }
      }
    };

    ws.onclose = (event) => {
      setConnected(false);

      if (!shouldReconnectRef.current) return;

      if (process.env.NODE_ENV !== "production") {
        console.debug("[dashboard] ws closed", { code: event.code, reason: event.reason, wasClean: event.wasClean });
      }

      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [accessToken, wsUrl]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) return;

    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;

    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    if (!wsUrl) return;
    if (!accessToken) return;

    connect();

    return () => {
      wsRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect, wsUrl, accessToken]);

  useEffect(() => {
    shouldReconnectRef.current = true;
  }, [accessToken]);

  const subscribe = useCallback((guildId: string, event: string, handler: (data: any) => void) => {
    const key = `${guildId}:${event}`;
    if (!listenersRef.current.has(key)) {
      listenersRef.current.set(key, new Set());
    }
    listenersRef.current.get(key)!.add(handler);

    return () => {
      listenersRef.current.get(key)?.delete(handler);
    };
  }, []);

  const subscribeGlobal = useCallback((event: string, handler: (data: any) => void) => {
    if (!globalListenersRef.current.has(event)) {
      globalListenersRef.current.set(event, new Set());
    }
    globalListenersRef.current.get(event)!.add(handler);

    return () => {
      globalListenersRef.current.get(event)?.delete(handler);
    };
  }, []);

  const joinGuild = useCallback((guildId: string) => {
    const current = subscribedGuildsRef.current.get(guildId) ?? 0;
    subscribedGuildsRef.current.set(guildId, current + 1);
    if (current === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", guildId }));
    }
  }, []);

  const leaveGuild = useCallback((guildId: string) => {
    const current = subscribedGuildsRef.current.get(guildId) ?? 0;
    if (current <= 1) {
      subscribedGuildsRef.current.delete(guildId);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "unsubscribe", guildId }));
      }
      return;
    }
    subscribedGuildsRef.current.set(guildId, current - 1);
  }, []);

  return <WebSocketContext.Provider value={{ connected, subscribe, subscribeGlobal, joinGuild, leaveGuild }}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket(): WebSocketContextValue {
  return useContext(WebSocketContext);
}
