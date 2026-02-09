import type { WebSocketManager } from "./WebSocketManager.js";

export interface BroadcastOptions {
  requiredAction?: string;
  requiredCategory?: string;
}

let wsManager: WebSocketManager | null = null;

export function setWebSocketManager(manager: WebSocketManager): void {
  wsManager = manager;
}

export function clearWebSocketManager(): void {
  wsManager = null;
}

export function broadcast(guildId: string, event: string, data?: unknown, options?: BroadcastOptions): void {
  wsManager?.broadcastToGuild(guildId, event, data ?? {}, options);
}

export function broadcastDashboardChange(guildId: string, plugin: string, type: string, options?: { requiredAction?: string; requiredCategory?: string; data?: Record<string, unknown> }): void {
  const payload = { plugin, type, ...(options?.data ?? {}) };
  const requiredAction = options?.requiredAction;
  const requiredCategory = requiredAction ? undefined : (options?.requiredCategory ?? plugin);
  broadcast(guildId, "dashboard:data_changed", payload, { requiredAction, requiredCategory });
}
