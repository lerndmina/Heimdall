"use client";

import { useWebSocket } from "@/lib/websocket";

export default function ConnectionIndicator() {
  const { connected } = useWebSocket();

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
      {connected ? "Live" : "Reconnecting"}
    </div>
  );
}
