# WebSocket Live Updates — Implementation Plan

> **Goal:** Every dashboard page reflects backend data changes in real-time without manual refresh. When a modmail arrives, an infraction is created, a config is saved, etc., every connected dashboard viewing that guild sees the update instantly.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Package Selection](#2-package-selection)
3. [Server-Side: WebSocket Gateway](#3-server-side-websocket-gateway)
4. [Event Taxonomy](#4-event-taxonomy)
5. [Plugin Event Emission Layer](#5-plugin-event-emission-layer)
6. [Client-Side: React Integration](#6-client-side-react-integration)
7. [Authentication & Security](#7-authentication--security)
8. [Deployment & Networking](#8-deployment--networking)
9. [Migration & Rollout Strategy](#9-migration--rollout-strategy)
10. [File Inventory](#10-file-inventory)

---

## 1. Architecture Overview

```
┌──────────────────────┐     ┌──────────────────────────────┐
│   Discord Bot Core   │     │     Dashboard (Next.js)      │
│   (Bun + Express)    │     │       Port 3000              │
│   Port 3001          │     │                              │
│                      │     │  ┌────────────────────────┐  │
│  ┌────────────────┐  │     │  │  WebSocketProvider     │  │
│  │ Plugin Service  │──┼─┐   │  │  (React Context)       │  │
│  │ (e.g. Modmail) │  │ │   │  │                        │  │
│  └────────────────┘  │ │   │  │  useRealtimeData()     │  │
│                      │ │   │  │  useWebSocket()        │  │
│  ┌────────────────┐  │ │   │  └───────────┬────────────┘  │
│  │ EventBroadcast │  │ │   │              │               │
│  │ Service        │◄─┘ │   │              │               │
│  └───────┬────────┘  │ │   └──────────────┼───────────────┘
│          │           │ │                  │
│  ┌───────▼────────┐  │ │    WebSocket     │
│  │ WebSocket      │  │ │    (wss://)      │
│  │ Server (ws)    │◄─┼─┼─────────────────┘
│  │ Port 3002      │  │
│  └───────┬────────┘  │
│          │           │
│  ┌───────▼────────┐  │
│  │ Redis Pub/Sub  │  │     (Future: multi-instance fanout)
│  └────────────────┘  │
└──────────────────────┘
```

**Key decisions:**

- **Dedicated WS port (3002)** — avoids complexity of HTTP upgrade negotiation on existing Express/Next.js servers. Cleanly separable for Traefik reverse proxy.
- **`ws` library** (not Socket.IO) — lightweight, no client framework lock-in, works perfectly with native `WebSocket` in the browser.
- **Redis Pub/Sub optional for now** — since the bot runs as a single process, direct in-process event emission works. Redis Pub/Sub is pre-wired for future horizontal scaling.
- **Guild-scoped rooms** — clients subscribe to `guild:{guildId}` channels. The server only sends events relevant to that guild.

---

## 2. Package Selection

### Server: `ws` (npm: `ws`)

- Zero-dependency WebSocket server for Node.js/Bun
- Supports HTTP upgrade interception on existing server OR standalone
- Well suited for Bun runtime (Bun has native WS support, but `ws` keeps compatibility)
- Already the pattern used by ModmailWebSocketService's `WebSocketServer` interface

```bash
bun add ws
bun add -d @types/ws
```

### Client: Native `WebSocket` API

- No additional packages needed — React 19 + modern browsers support `WebSocket` natively
- Custom reconnection logic via a small `ReconnectingWebSocket` wrapper (~50 lines)

### Why not Socket.IO?

- Socket.IO adds 40KB+ client bundle overhead
- Requires matching server/client versions
- Our use case (server→client broadcast + simple subscribe/unsubscribe) doesn't need Socket.IO's features (rooms, namespaces, binary, fallback transports)
- The existing `ModmailWebSocketService` interface can be adapted with minimal changes

---

## 3. Server-Side: WebSocket Gateway

### 3.1 Core WebSocket Server

**File:** `src/core/WebSocketManager.ts`

```ts
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { RedisClientType } from "redis";
import { createLogger } from "./Logger.js";

const log = createLogger("ws");

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  guildIds: Set<string>; // guilds this client subscribed to
  isAlive: boolean;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private guildRooms: Map<string, Set<AuthenticatedSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timer | null = null;

  constructor(
    private port: number,
    private redis?: RedisClientType,
  ) {}

  /**
   * Start the WebSocket server on its own port.
   */
  async start(): Promise<void> {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on("connection", (ws, req) => this.handleConnection(ws as AuthenticatedSocket, req));
    this.startHeartbeat();

    // Optional: subscribe to Redis for multi-instance fanout
    if (this.redis) {
      await this.subscribeRedis();
    }

    log.info(`✅ WebSocket server listening on port ${this.port}`);
  }

  /**
   * Broadcast an event to all clients in a specific guild room.
   */
  broadcastToGuild(guildId: string, event: string, data: unknown): void {
    const room = this.guildRooms.get(guildId);
    if (!room || room.size === 0) return;

    const message = JSON.stringify({ event, data, guildId, timestamp: Date.now() });
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }

    log.debug(`Broadcast ${event} to ${room.size} clients in guild ${guildId}`);
  }

  /**
   * Handle new client connection.
   */
  private handleConnection(ws: AuthenticatedSocket, req: IncomingMessage): void {
    ws.isAlive = true;
    ws.guildIds = new Set();

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleClientMessage(ws, msg);
      } catch {
        ws.send(JSON.stringify({ event: "error", data: { message: "Invalid JSON" } }));
      }
    });

    ws.on("close", () => this.handleDisconnect(ws));

    // Send welcome message with expected protocol
    ws.send(
      JSON.stringify({
        event: "connected",
        data: { message: "Authenticate with { type: 'auth', token: '<session-token>' }" },
      }),
    );
  }

  /**
   * Handle incoming client messages (auth, subscribe, unsubscribe).
   */
  private handleClientMessage(ws: AuthenticatedSocket, msg: any): void {
    switch (msg.type) {
      case "auth":
        // Validate session token (see Section 7)
        this.authenticateClient(ws, msg.token);
        break;
      case "subscribe":
        this.subscribeToGuild(ws, msg.guildId);
        break;
      case "unsubscribe":
        this.unsubscribeFromGuild(ws, msg.guildId);
        break;
      case "ping":
        ws.send(JSON.stringify({ event: "pong" }));
        break;
    }
  }

  // ... auth, subscribe, heartbeat, Redis methods
}
```

### 3.2 Client Message Protocol

All messages are JSON. Client → Server:

| Message       | Fields                                     | Description                                  |
| ------------- | ------------------------------------------ | -------------------------------------------- |
| `auth`        | `{ type: "auth", token: string }`          | Authenticate with NextAuth session token     |
| `subscribe`   | `{ type: "subscribe", guildId: string }`   | Join guild room (must have dashboard access) |
| `unsubscribe` | `{ type: "unsubscribe", guildId: string }` | Leave guild room                             |
| `ping`        | `{ type: "ping" }`                         | Keep-alive (server replies `pong`)           |

Server → Client:

| Event              | Payload                | Description                        |
| ------------------ | ---------------------- | ---------------------------------- |
| `connected`        | `{ message }`          | Welcome message after connection   |
| `authenticated`    | `{ userId, guilds[] }` | Auth success with available guilds |
| `subscribed`       | `{ guildId }`          | Successfully joined guild room     |
| `error`            | `{ message, code }`    | Auth failure, invalid guild, etc.  |
| `pong`             | `{}`                   | Heartbeat reply                    |
| `<plugin>:<event>` | Varies per event       | Data change notification (see §4)  |

### 3.3 Integration Point: Boot Sequence

In `src/index.ts`, after `apiManager.start()`:

```ts
// After API manager is started:
const wsPort = parseInt(process.env.WS_PORT || "3002", 10);
const wsManager = new WebSocketManager(wsPort, client.redis);
await wsManager.start();

// Make it accessible to plugins via client
client.wsManager = wsManager;
```

The `wsManager` instance is passed to plugins through the `PluginContext` so each plugin can call `wsManager.broadcastToGuild(guildId, event, data)`.

---

## 4. Event Taxonomy

Events follow the naming convention `<plugin>:<action>` and carry a consistent envelope:

```ts
interface WebSocketEvent {
  event: string; // e.g., "moderation:infraction_created"
  guildId: string;
  data: unknown; // event-specific payload
  timestamp: number; // Unix ms
}
```

### 4.1 Events by Plugin

#### Moderation

| Event                           | Trigger                  | Payload                |
| ------------------------------- | ------------------------ | ---------------------- |
| `moderation:config_updated`     | Config PUT API           | Updated config object  |
| `moderation:rule_created`       | Rule create API          | New rule               |
| `moderation:rule_updated`       | Rule update/toggle API   | Updated rule + changes |
| `moderation:rule_deleted`       | Rule delete API          | Deleted rule ID        |
| `moderation:preset_created`     | Preset create API        | New preset             |
| `moderation:preset_updated`     | Preset update API        | Updated preset         |
| `moderation:preset_deleted`     | Preset delete API        | Deleted preset ID      |
| `moderation:infraction_created` | Auto-mod / manual action | New infraction         |
| `moderation:infraction_updated` | Infraction appeal/edit   | Updated infraction     |
| `moderation:stats_updated`      | Periodic or after action | Updated stats          |

#### Modmail

| Event                            | Trigger                          | Payload                |
| -------------------------------- | -------------------------------- | ---------------------- |
| `modmail:conversation_created`   | New DM → modmail                 | Conversation info      |
| `modmail:conversation_updated`   | Claim, priority, category change | Conversation + changes |
| `modmail:conversation_closed`    | Staff close / auto-close         | Conversation + metrics |
| `modmail:message_received`       | User DM relay                    | Message info           |
| `modmail:message_sent`           | Staff reply relay                | Message info           |
| `modmail:conversation_claimed`   | Staff claims                     | Claimer info           |
| `modmail:conversation_unclaimed` | Staff unclaims                   | Unclaimer info         |
| `modmail:config_updated`         | Config change via dashboard      | Config snapshot        |
| `modmail:stats_updated`          | After lifecycle events           | Aggregate stats        |

> **Note:** The existing `ModmailWebSocketService` already defines all these payloads and methods. It just needs its `WebSocketServer` interface wired to the real `WebSocketManager`.

#### Tickets

| Event                    | Trigger                 | Payload          |
| ------------------------ | ----------------------- | ---------------- |
| `tickets:ticket_created` | New ticket opened       | Ticket info      |
| `tickets:ticket_closed`  | Ticket closed/resolved  | Ticket + metrics |
| `tickets:ticket_claimed` | Staff claims ticket     | Ticket + claimer |
| `tickets:config_updated` | Dashboard config change | Config snapshot  |
| `tickets:stats_updated`  | After lifecycle events  | Aggregate stats  |

#### Suggestions

| Event                            | Trigger                  | Payload                 |
| -------------------------------- | ------------------------ | ----------------------- |
| `suggestions:suggestion_created` | New suggestion submitted | Suggestion info         |
| `suggestions:status_changed`     | Approve/deny/implement   | Suggestion + new status |
| `suggestions:config_updated`     | Dashboard config change  | Config snapshot         |
| `suggestions:stats_updated`      | After lifecycle events   | Aggregate stats         |

#### Tags

| Event              | Trigger        | Payload        |
| ------------------ | -------------- | -------------- |
| `tags:tag_created` | Tag create API | New tag        |
| `tags:tag_updated` | Tag update API | Updated tag    |
| `tags:tag_deleted` | Tag delete API | Deleted tag ID |

#### Logging

| Event                    | Trigger                 | Payload         |
| ------------------------ | ----------------------- | --------------- |
| `logging:config_updated` | Dashboard config change | Config snapshot |

#### Welcome

| Event                    | Trigger                 | Payload         |
| ------------------------ | ----------------------- | --------------- |
| `welcome:config_updated` | Dashboard config change | Config snapshot |

#### TempVC

| Event                    | Trigger                 | Payload         |
| ------------------------ | ----------------------- | --------------- |
| `tempvc:config_updated`  | Dashboard config change | Config snapshot |
| `tempvc:channel_created` | User creates temp VC    | Channel info    |
| `tempvc:channel_deleted` | Temp VC auto-deleted    | Channel ID      |
| `tempvc:stats_updated`   | After lifecycle events  | Aggregate stats |

#### Minecraft

| Event                      | Trigger                 | Payload         |
| -------------------------- | ----------------------- | --------------- |
| `minecraft:status_updated` | Server status poll      | Server status   |
| `minecraft:player_linked`  | Link request approved   | Player info     |
| `minecraft:config_updated` | Dashboard config change | Config snapshot |

#### Attachment Blocker

| Event                               | Trigger                 | Payload         |
| ----------------------------------- | ----------------------- | --------------- |
| `attachment-blocker:config_updated` | Dashboard config change | Config snapshot |

#### Reminders

| Event                          | Trigger          | Payload       |
| ------------------------------ | ---------------- | ------------- |
| `reminders:reminder_created`   | New reminder     | Reminder info |
| `reminders:reminder_triggered` | Reminder fires   | Reminder ID   |
| `reminders:reminder_deleted`   | Reminder deleted | Reminder ID   |

#### VC Transcription

| Event                             | Trigger                 | Payload         |
| --------------------------------- | ----------------------- | --------------- |
| `vc-transcription:config_updated` | Dashboard config change | Config snapshot |

#### Dashboard / Settings

| Event                           | Trigger           | Payload             |
| ------------------------------- | ----------------- | ------------------- |
| `dashboard:permissions_updated` | Permission change | Updated permissions |
| `dashboard:settings_updated`    | Settings change   | Updated settings    |

---

## 5. Plugin Event Emission Layer

### 5.1 Strategy: Emit at the API Route Level

The simplest and most reliable approach is to emit WebSocket events **at the API route handler level** — right after a successful database write. This has several advantages:

- **Dashboard-originated changes** (config saves, CRUD operations) always go through the API, so the WS event is guaranteed to fire
- **Bot-originated changes** (auto-mod infractions, modmail lifecycle events) emit from the service layer directly
- No need to add Mongoose middleware or change models

### 5.2 Shared Broadcast Helper

**File:** `src/core/broadcast.ts`

```ts
import type { WebSocketManager } from "./WebSocketManager.js";

let wsManager: WebSocketManager | null = null;

export function setWebSocketManager(ws: WebSocketManager): void {
  wsManager = ws;
}

/**
 * Broadcast an event to all dashboard clients viewing a specific guild.
 * Safe to call even if WS is not initialized (no-ops silently).
 */
export function broadcast(guildId: string, event: string, data?: unknown): void {
  wsManager?.broadcastToGuild(guildId, event, data ?? {});
}
```

### 5.3 Example: Emitting from a Moderation API Route

In `plugins/moderation/api/config.ts` (PUT handler):

```ts
import { broadcast } from "../../../src/core/broadcast.js";

// ... existing PUT /config handler
router.put("/config", async (req, res) => {
  // ... validate, save to DB ...
  const updatedConfig = await config.save();

  // Broadcast to connected dashboards
  broadcast(req.params.guildId, "moderation:config_updated", {
    config: updatedConfig.toJSON(),
    updatedBy: req.body._dashboardUserId,
  });

  res.json({ success: true, data: updatedConfig });
});
```

### 5.4 Example: Emitting from a Bot Service (Non-API)

For events originating from Discord (e.g., auto-mod actions), emit from the service layer:

```ts
// In moderation service after creating an infraction
import { broadcast } from "../../../src/core/broadcast.js";

broadcast(guildId, "moderation:infraction_created", {
  infraction: { id, type, userId, moderatorId, reason, points, expiresAt },
});
```

### 5.5 Wiring ModmailWebSocketService

The existing `ModmailWebSocketService` needs a simple adapter to bridge its `WebSocketServer` interface to the new `WebSocketManager`:

```ts
// In modmail plugin onLoad:
const wsAdapter: WebSocketServer = {
  to(room: string) {
    return {
      emit(event: string, data: unknown) {
        // room is "guild:{guildId}", extract guildId
        const guildId = room.replace("guild:", "");
        wsManager.broadcastToGuild(guildId, event, data);
      },
    };
  },
};

const modmailWs = new ModmailWebSocketService(wsAdapter);
// Now wire modmailWs calls into ModmailService lifecycle methods
```

---

## 6. Client-Side: React Integration

### 6.1 WebSocket Provider

**File:** `plugins/dashboard/app/lib/websocket.tsx`

A React Context that manages a single WebSocket connection per authenticated session, with automatic reconnection.

```tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useSession } from "next-auth/react";

interface WSContextType {
  /** Whether the WebSocket is connected and authenticated */
  connected: boolean;
  /** Subscribe to events for a guild. Returns unsubscribe function. */
  subscribe: (guildId: string, event: string, handler: (data: any) => void) => () => void;
  /** Subscribe to a guild room (auto-called by useRealtimeData) */
  joinGuild: (guildId: string) => void;
  /** Leave a guild room */
  leaveGuild: (guildId: string) => void;
}

const WebSocketContext = createContext<WSContextType>({
  connected: false,
  subscribe: () => () => {},
  joinGuild: () => {},
  leaveGuild: () => {},
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const subscribedGuildsRef = useRef<Set<string>>(new Set());

  const WS_URL = process.env.NEXT_PUBLIC_WS_URL || `ws://localhost:3002`;

  const connect = useCallback(() => {
    if (!session?.user) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // Authenticate immediately
      ws.send(JSON.stringify({ type: "auth", token: session.accessToken }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.event === "authenticated") {
        setConnected(true);
        // Re-subscribe to guilds after reconnection
        for (const guildId of subscribedGuildsRef.current) {
          ws.send(JSON.stringify({ type: "subscribe", guildId }));
        }
        return;
      }

      // Dispatch to listeners
      const key = `${msg.guildId}:${msg.event}`;
      const handlers = listenersRef.current.get(key);
      if (handlers) {
        for (const handler of handlers) {
          handler(msg.data);
        }
      }

      // Also dispatch to wildcard listeners (guild:*)
      const wildcardKey = `${msg.guildId}:*`;
      const wildcardHandlers = listenersRef.current.get(wildcardKey);
      if (wildcardHandlers) {
        for (const handler of wildcardHandlers) {
          handler({ event: msg.event, data: msg.data });
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential backoff reconnection
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [session, WS_URL]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

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

  const joinGuild = useCallback((guildId: string) => {
    subscribedGuildsRef.current.add(guildId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", guildId }));
    }
  }, []);

  const leaveGuild = useCallback((guildId: string) => {
    subscribedGuildsRef.current.delete(guildId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", guildId }));
    }
  }, []);

  return <WebSocketContext.Provider value={{ connected, subscribe, joinGuild, leaveGuild }}>{children}</WebSocketContext.Provider>;
}

export const useWebSocket = () => useContext(WebSocketContext);
```

### 6.2 `useRealtimeData` Hook

The primary hook for pages. Automatically fetches data on mount, subscribes to WS events, and refetches or patches data when events arrive.

**File:** `plugins/dashboard/app/hooks/useRealtimeData.ts`

```ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { fetchApi } from "../lib/api";
import { useWebSocket } from "../lib/websocket";
import { cache } from "../lib/cache";

interface UseRealtimeDataOptions<T> {
  /** API path to fetch (relative to /api/guilds/:guildId/) */
  path: string;
  /** WS events that should trigger a refetch */
  events: string[];
  /** Optional: transform/patch state from WS event instead of full refetch */
  onEvent?: (event: string, data: any, current: T | null) => T | "refetch";
  /** Cache key for localStorage (optional) */
  cacheKey?: string;
  /** Whether to skip initial fetch */
  skip?: boolean;
}

export function useRealtimeData<T>(options: UseRealtimeDataOptions<T>) {
  const { path, events, onEvent, cacheKey, skip } = options;
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
      const result = await fetchApi<T>(guildId, path, {
        skipCache: true, // Always get fresh data
      });
      if (result.success && result.data) {
        setData(result.data);
        dataRef.current = result.data;
        // Update cache so other components see fresh data
        if (cacheKey) {
          cache.set(cacheKey, result.data);
        }
      } else {
        setError(result.error?.message || "Failed to fetch data");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [guildId, path, skip, cacheKey]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to guild room
  useEffect(() => {
    if (!guildId) return;
    joinGuild(guildId);
    return () => leaveGuild(guildId);
  }, [guildId, joinGuild, leaveGuild]);

  // Subscribe to WS events
  useEffect(() => {
    if (!guildId) return;

    const unsubscribers = events.map((event) =>
      subscribe(guildId, event, (eventData) => {
        if (onEvent) {
          const result = onEvent(event, eventData, dataRef.current);
          if (result === "refetch") {
            fetchData();
          } else {
            setData(result);
            dataRef.current = result;
            if (cacheKey) cache.set(cacheKey, result);
          }
        } else {
          // Default: just refetch
          fetchData();
        }

        // Invalidate related caches
        if (cacheKey) cache.invalidate(cacheKey);
      }),
    );

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [guildId, events, subscribe, onEvent, fetchData, cacheKey]);

  return { data, loading, error, refetch: fetchData, setData };
}
```

### 6.3 `useRealtimeEvent` Hook

For pages that just want to listen for events without managing data state:

```ts
export function useRealtimeEvent(event: string, handler: (data: any) => void) {
  const { guildId } = useParams<{ guildId: string }>();
  const { subscribe, joinGuild, leaveGuild } = useWebSocket();

  useEffect(() => {
    if (!guildId) return;
    joinGuild(guildId);
    const unsub = subscribe(guildId, event, handler);
    return () => {
      unsub();
      leaveGuild(guildId);
    };
  }, [guildId, event, handler, subscribe, joinGuild, leaveGuild]);
}
```

### 6.4 Layout Integration

Add `WebSocketProvider` to the root layout:

```tsx
// plugins/dashboard/app/app/layout.tsx
import { WebSocketProvider } from "../lib/websocket";

// Wrap children:
<SessionProvider>
  <WebSocketProvider>{children}</WebSocketProvider>
</SessionProvider>;
```

### 6.5 Example: Moderation Page Migration

Before (current):

```tsx
useEffect(() => {
  fetchApi(guildId, "moderation/config").then((res) => {
    if (res.success) setConfig(res.data);
  });
}, [guildId]);
```

After:

```tsx
const { data: config, loading } = useRealtimeData<ModerationConfig>({
  path: "moderation/config",
  events: [
    "moderation:config_updated",
    "moderation:rule_created",
    "moderation:rule_updated",
    "moderation:rule_deleted",
    "moderation:preset_created",
    "moderation:preset_updated",
    "moderation:preset_deleted",
  ],
  cacheKey: `moderation-config-${guildId}`,
});
```

### 6.6 Connection Status Indicator

A small visual indicator showing WS connection status, placed in the sidebar or header:

```tsx
function ConnectionIndicator() {
  const { connected } = useWebSocket();
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
      <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
      {connected ? "Live" : "Reconnecting..."}
    </div>
  );
}
```

### 6.7 Toast Notifications on Events

Optionally show toast notifications when important events arrive:

```tsx
// In any page component:
useRealtimeEvent("moderation:infraction_created", (data) => {
  toast.info(`New infraction: ${data.infraction.type} for ${data.infraction.userId}`);
});
```

---

## 7. Authentication & Security

### 7.1 Session Token Flow

1. Dashboard user authenticates via NextAuth (Discord OAuth)
2. NextAuth session includes a **session token** (the JWT)
3. On WS connect, client sends `{ type: "auth", token: "<nextauth-session-jwt>" }`
4. WS server verifies the JWT using the same `AUTH_SECRET` as NextAuth
5. WS server extracts `userId` and fetches dashboard permissions from MongoDB (`DashboardPermission` model)
6. Server responds with `{ event: "authenticated", data: { userId, guilds } }`

### 7.2 Guild Subscription Authorization

When a client sends `{ type: "subscribe", guildId }`:

1. Server checks if the user has dashboard access for that guild (via `DashboardPermission` or Discord API mutual-guilds check)
2. If authorized → add to room, send `{ event: "subscribed", guildId }`
3. If not → send `{ event: "error", data: { code: "FORBIDDEN", message: "No access to this guild" } }`

### 7.3 Rate Limiting

- Max 5 subscribe/unsubscribe messages per second per client
- Max 10 guilds subscribed simultaneously per client
- Clients that exceed limits are disconnected with a warning

### 7.4 Environment Variable

```env
# New env var needed:
WS_PORT=3002
NEXT_PUBLIC_WS_URL=wss://ws-maidbot.thirdplacemc.net  # or ws://localhost:3002 for dev
```

---

## 8. Deployment & Networking

### 8.1 Docker Changes

**Dockerfile** — add `EXPOSE 3002`:

```dockerfile
EXPOSE 3000 3001 3002
```

**docker-compose.yml** — add port mapping:

```yaml
bot:
  ports:
    - "${DASHBOARD_PORT:-3000}:3000"
    - "${API_PORT:-3001}:3001"
    - "${WS_PORT:-3002}:3002"
  environment:
    - WS_PORT=3002
    - NEXT_PUBLIC_WS_URL=wss://ws-maidbot.thirdplacemc.net
```

### 8.2 Traefik Configuration

Route `wss://ws-maidbot.thirdplacemc.net` → port 3002 on the bot container.

Traefik dynamic config example:

```yaml
http:
  routers:
    heimdall-ws:
      rule: "Host(`ws-maidbot.thirdplacemc.net`)"
      service: heimdall-ws
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    heimdall-ws:
      loadBalancer:
        servers:
          - url: "http://heimdall-bot:3002"
```

### 8.3 CORS / Origin Validation

The WS server should validate the `Origin` header on upgrade:

```ts
wss.on("headers", (headers, req) => {
  const origin = req.headers.origin;
  const allowedOrigins = ["https://maidbot.thirdplacemc.net", "http://localhost:3000"];
  if (origin && !allowedOrigins.includes(origin)) {
    // Reject by destroying the socket
    req.destroy();
  }
});
```

---

## 9. Migration & Rollout Strategy

### Phase 1: Foundation (Core Infrastructure)

1. Install `ws` + `@types/ws`
2. Create `WebSocketManager` class
3. Create `broadcast()` helper
4. Add `WS_PORT` env var, wire into boot sequence
5. Update Docker config (port exposure)
6. Create `WebSocketProvider` + `useRealtimeData` hook on client
7. Add `ConnectionIndicator` widget to dashboard sidebar
8. **Test:** Connect from browser console, verify subscribe/auth flow

### Phase 2: First Plugin (Moderation — already most complex dashboard page)

1. Add `broadcast()` calls to moderation API routes (config, rules, presets, infractions)
2. Migrate `ModerationPage.tsx` to use `useRealtimeData`
3. **Test:** Open two browser tabs, make changes in one, see live updates in the other

### Phase 3: Modmail (Leverage existing WebSocketService)

1. Wire `ModmailWebSocketService` to `WebSocketManager` via adapter
2. Wire broadcast calls into `ModmailService` lifecycle methods
3. Migrate modmail dashboard page to `useRealtimeData`
4. **Test:** Send a DM to the bot, see new conversation appear in dashboard instantly

### Phase 4: Remaining Plugins (Incremental)

Order by traffic/importance:

1. Tickets (has SupportEventBus — easy to wire)
2. Suggestions (popular feature)
3. Guild overview page (stats from multiple plugins)
4. Tags
5. TempVC, Minecraft, Logging, Welcome, Reminders
6. Attachment Blocker, VC Transcription, Settings

### Phase 5: Polish

1. Toast notifications for key events
2. Optimistic updates (patch state from WS payload instead of refetching)
3. Redis Pub/Sub fanout (for future multi-instance scaling)
4. Rate limiting and abuse protection
5. Reconnection backoff with jitter

---

## 10. File Inventory

### New Files to Create

| File                                                       | Purpose                                         |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `src/core/WebSocketManager.ts`                             | WS server, rooms, auth, heartbeat               |
| `src/core/broadcast.ts`                                    | Global `broadcast(guildId, event, data)` helper |
| `plugins/dashboard/app/lib/websocket.tsx`                  | React Context + Provider (client WS management) |
| `plugins/dashboard/app/hooks/useRealtimeData.ts`           | Data-fetching hook with WS subscription         |
| `plugins/dashboard/app/hooks/useRealtimeEvent.ts`          | Simple event listener hook                      |
| `plugins/dashboard/app/components/ConnectionIndicator.tsx` | WS status dot in sidebar                        |

### Files to Modify

| File                                                   | Changes                                              |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `src/index.ts`                                         | Boot `WebSocketManager`, pass to plugin contexts     |
| `src/types/Client.ts`                                  | Add `wsManager: WebSocketManager` property           |
| `src/types/Plugin.ts`                                  | Add `wsManager: WebSocketManager` to `PluginContext` |
| `plugins/dashboard/app/app/layout.tsx`                 | Wrap in `<WebSocketProvider>`                        |
| `plugins/dashboard/app/app/[guildId]/layout.tsx`       | (If exists) auto-join guild room                     |
| `package.json`                                         | Add `ws` + `@types/ws` dependencies                  |
| `Dockerfile`                                           | `EXPOSE 3002`                                        |
| `docker-compose.yml`                                   | Port mapping + env vars                              |
| `.env` / `.env.example`                                | `WS_PORT`, `NEXT_PUBLIC_WS_URL`                      |
| `plugins/moderation/api/config.ts`                     | Add `broadcast()` calls                              |
| `plugins/moderation/api/rules.ts`                      | Add `broadcast()` calls                              |
| `plugins/moderation/api/infractions.ts`                | Add `broadcast()` calls                              |
| `plugins/modmail/index.ts`                             | Wire WebSocketService adapter                        |
| `plugins/modmail/websocket/ModmailWebSocketService.ts` | No changes needed (already complete!)                |
| All other plugin API routes                            | Add `broadcast()` calls (incremental)                |
| All dashboard `*Page.tsx` components                   | Migrate to `useRealtimeData` (incremental)           |

### Env Vars to Add

| Variable             | Default               | where                |
| -------------------- | --------------------- | -------------------- |
| `WS_PORT`            | `3002`                | Bot runtime          |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3002` | Dashboard build-time |

---

## Summary

| Aspect                        | Choice                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| **WS Library**                | `ws` (server) + native `WebSocket` (client)                                              |
| **Port**                      | 3002 (dedicated, Traefik-proxied as `wss://ws-maidbot.thirdplacemc.net`)                 |
| **Auth**                      | NextAuth JWT verification on WS upgrade                                                  |
| **Room model**                | `guild:{guildId}` — clients subscribe per guild                                          |
| **Event emission**            | `broadcast(guildId, event, data)` called from API routes & services                      |
| **Client hook**               | `useRealtimeData()` — auto-fetch + auto-subscribe + auto-refetch                         |
| **Existing assets leveraged** | `ApiManager.getServer()`, `ModmailWebSocketService`, `SupportEventBus`, Redis connection |
| **Rollout**                   | 5 phases: Foundation → Moderation → Modmail → Other plugins → Polish                     |
