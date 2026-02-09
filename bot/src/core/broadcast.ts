import type { WebSocketManager } from "./WebSocketManager.js";

let wsManager: WebSocketManager | null = null;

export function setWebSocketManager(manager: WebSocketManager): void {
  wsManager = manager;
}

export function clearWebSocketManager(): void {
  wsManager = null;
}

export function broadcast(guildId: string, event: string, data?: unknown): void {
  wsManager?.broadcastToGuild(guildId, event, data ?? {});
}
