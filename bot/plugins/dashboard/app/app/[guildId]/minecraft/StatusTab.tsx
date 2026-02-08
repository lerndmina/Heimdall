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

  // Add-server modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MonitoredServer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchApi<StatusResponse>(guildId, "minecraft/status");
      if (res.success && res.data) {
        setServers(res.data.servers);
      } else {
        // Check for permission denied errors
        if (res.error?.code === "FORBIDDEN" || res.error?.code === "UNAUTHORIZED" || res.error?.message?.toLowerCase().includes("permission")) {
          setError("Access denied: You don't have permission to view server configuration");
        } else {
          setError(res.error?.message ?? "Failed to load server status");
        }
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

  // Callback after a server is added
  const handleServerAdded = useCallback(() => {
    setShowAddModal(false);
    fetchStatus();
  }, [fetchStatus]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, `minecraft/status/${deleteTarget.id}`, { method: "DELETE" });
      if (res.success) {
        setServers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }, [guildId, deleteTarget]);

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
      <>
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 backdrop-blur-sm p-4">
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
          <CardDescription className="mt-2 max-w-md">Add a Minecraft server to start monitoring its status from the dashboard.</CardDescription>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
            <PlusIcon />
            Add Server
          </button>
        </Card>

        {showAddModal && <AddServerModal guildId={guildId} onClose={() => setShowAddModal(false)} onAdded={handleServerAdded} />}
      </>
    );
  }

  // ====== Server cards ======
  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {servers.length} server{servers.length !== 1 ? "s" : ""} monitored
        </p>
        <div className="flex items-center gap-2">
          <button onClick={fetchStatus} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/30 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5">
            <RefreshIcon />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-500">
            <PlusIcon />
            Add Server
          </button>
        </div>
      </div>

      {servers.map((server) => (
        <ServerCard key={server.id} server={server} onDelete={() => setDeleteTarget(server)} />
      ))}

      {/* Add modal */}
      {showAddModal && <AddServerModal guildId={guildId} onClose={() => setShowAddModal(false)} onAdded={handleServerAdded} />}

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove Server"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5" disabled={deleting}>
              Cancel
            </button>
            <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50" disabled={deleting}>
              {deleting ? "Removing…" : "Remove"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-300">
          Are you sure you want to remove <strong>{deleteTarget?.serverName}</strong>? This will stop monitoring and delete any persistent status embeds.
        </p>
      </Modal>
    </div>
  );
}

// ===========================================================================
// Add Server Modal
// ===========================================================================

interface AddServerModalProps {
  guildId: string;
  onClose: () => void;
  onAdded: () => void;
}

function AddServerModal({ guildId, onClose, onAdded }: AddServerModalProps) {
  const [serverName, setServerName] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [serverPort, setServerPort] = useState(25565);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!serverName.trim() || !serverIp.trim()) {
      setError("Server name and IP are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetchApi(guildId, "minecraft/status", {
        method: "POST",
        body: JSON.stringify({ serverName: serverName.trim(), serverIp: serverIp.trim(), serverPort }),
      });

      if (res.success) {
        onAdded();
      } else {
        setError(res.error?.message ?? "Failed to add server");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add Monitored Server"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !serverName.trim() || !serverIp.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
            {saving ? "Adding…" : "Add Server"}
          </button>
        </>
      }>
      <div className="space-y-4">
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

        <TextInput label="Server Name" description="A friendly display name for this server" value={serverName} onChange={setServerName} placeholder="My Minecraft Server" required />

        <TextInput label="Server IP" description="The IP address or hostname of your server" value={serverIp} onChange={setServerIp} placeholder="play.example.com" required />

        <NumberInput label="Server Port" description="Minecraft server port (default: 25565)" value={serverPort} onChange={setServerPort} min={1} max={65535} />

        <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-3 py-2 text-xs text-zinc-400">
          💡 The server must be online and reachable to be added. It will be pinged to verify connectivity.
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Server Card
// ===========================================================================

function ServerCard({ server, onDelete }: { server: MonitoredServer; onDelete: () => void }) {
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 backdrop-blur-sm text-zinc-500">
              <ServerIcon />
            </div>
          )}
          <div>
            <CardTitle className="text-base">{server.serverName}</CardTitle>
            <p className="text-xs text-zinc-500">
              {server.serverIp}:{server.serverPort}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant={isOnline ? "success" : "error"}>{isOnline ? "Online" : ping === null ? "No Data" : "Offline"}</StatusBadge>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400" title="Remove server">
            <TrashIcon />
          </button>
        </div>
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
          <div className="mt-4 rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-4 py-3">
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
                <div key={p.uuid} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-2 py-1 text-xs">
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
            <RefreshIcon />
            Auto-updating embed every {Math.round(server.persistData.updateInterval / 1000)}s
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Small icons
// ===========================================================================

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
      />
    </svg>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-4">
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
