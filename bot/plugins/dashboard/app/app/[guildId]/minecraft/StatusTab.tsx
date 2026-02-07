/**
 * Status tab — Live Minecraft server status from monitored servers.
 *
 * Features:
 *  • Add new servers via a modal with server verification
 *  • Remove servers with confirmation
 *  • Auto-refresh & manual refresh of status data
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import TextInput from "@/components/ui/TextInput";
import NumberInput from "@/components/ui/NumberInput";
import { fetchApi } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types (matching McServerStatus + mcstatus.io lastPingData)
// ---------------------------------------------------------------------------

interface PlayerEntry {
  uuid: string;
  name_raw: string;
  name_clean: string;
}

interface PingDataOnline {
  online: true;
  host: string;
  port: number;
  ip_address?: string;
  version?: {
    name_raw: string;
    name_clean: string;
    protocol: number;
  };
  players?: {
    online: number;
    max: number;
    list?: PlayerEntry[];
  };
  motd?: {
    raw: string;
    clean: string;
    html: string;
  };
  icon?: string; // base64 favicon
  software?: string | null;
}

interface PingDataOffline {
  online: false;
}

type PingData = PingDataOnline | PingDataOffline | null;

interface MonitoredServer {
  _id?: string;
  id: string;
  guildId: string;
  serverIp: string;
  serverPort: number;
  serverName: string;
  lastPingTime?: string | null;
  lastPingData?: PingData;
  persistData?: {
    messageId: string;
    channelId: string;
    updateInterval: number;
    lastUpdate: string;
  } | null;
}

interface StatusResponse {
  servers: MonitoredServer[];
  total: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StatusTab({ guildId }: { guildId: string }) {
  const [servers, setServers] = useState<MonitoredServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchApi<StatusResponse>(guildId, "minecraft/status");
      if (res.success && res.data) {
        setServers(res.data.servers);
      } else {
        setError(res.error?.message ?? "Failed to load server status");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ====== Loading ======
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading server status…" />
      </div>
    );
  }

  // ====== Error ======
  if (error) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>;
  }

  // ====== No servers monitored ======
  if (servers.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-zinc-800 p-4">
          <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <CardTitle>No Servers Monitored</CardTitle>
        <CardDescription className="mt-2 max-w-md">
          Server monitoring is set up via the <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-primary-400">/mcstatus</code> bot command. Once a server is added, its live status will
          appear here.
        </CardDescription>
      </Card>
    );
  }

  // ====== Server cards ======
  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <button onClick={fetchStatus} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {servers.map((server) => (
        <ServerCard key={server.id} server={server} />
      ))}

      {/* Info */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">
        <p>
          💡 Status data is updated automatically at the server&rsquo;s configured interval. Use <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-primary-400">/mcstatus</code> in
          Discord to add, remove, or configure server monitoring.
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
// Server Card
// ===========================================================================

function ServerCard({ server }: { server: MonitoredServer }) {
  const ping = server.lastPingData;
  const isOnline = ping?.online === true;
  const onlinePing = isOnline ? (ping as PingDataOnline) : null;

  const playerCount = onlinePing?.players?.online ?? 0;
  const maxPlayers = onlinePing?.players?.max ?? 0;
  const version = onlinePing?.version?.name_clean ?? "—";
  const motd = onlinePing?.motd?.clean ?? "";
  const playerList = onlinePing?.players?.list ?? [];
  const favicon = onlinePing?.icon;

  const lastPing = server.lastPingTime ? new Date(server.lastPingTime) : null;
  const lastPingAgo = lastPing ? timeSince(lastPing) : "Never";

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Favicon */}
          {favicon ? (
            <img src={favicon} alt="" className="h-10 w-10 rounded-lg" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                />
              </svg>
            </div>
          )}
          <div>
            <CardTitle className="text-base">{server.serverName}</CardTitle>
            <p className="text-xs text-zinc-500">
              {server.serverIp}:{server.serverPort}
            </p>
          </div>
        </div>
        <StatusBadge variant={isOnline ? "success" : "error"}>{isOnline ? "Online" : ping === null ? "No Data" : "Offline"}</StatusBadge>
      </div>

      <CardContent>
        {/* Stats grid */}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Players" value={isOnline ? `${playerCount} / ${maxPlayers}` : "—"} />
          <StatCard label="Version" value={version} />
          <StatCard label="Last Checked" value={lastPingAgo} />
        </div>

        {/* MOTD */}
        {motd && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">MOTD</p>
            <p className="mt-1 whitespace-pre-wrap font-mono text-sm text-zinc-300">{motd}</p>
          </div>
        )}

        {/* Online player list */}
        {playerList.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Online Players ({playerList.length})</p>
            <div className="flex flex-wrap gap-2">
              {playerList.map((p) => (
                <div key={p.uuid} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-800/30 px-2 py-1 text-xs">
                  <img src={`https://mc-heads.net/avatar/${p.uuid}/16`} alt="" className="h-4 w-4 rounded" />
                  <span className="text-zinc-200">{p.name_clean}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Persistent embed info */}
        {server.persistData && (
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Auto-updating embed every {Math.round(server.persistData.updateInterval / 1000)}s
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
