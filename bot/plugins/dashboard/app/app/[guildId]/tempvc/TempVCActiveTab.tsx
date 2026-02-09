/**
 * TempVCActiveTab — read-only view of currently active temp voice channels + stats.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface TempVCStats {
  totalCreated: number;
  totalActive: number;
  avgLifetimeSeconds: number;
}

interface ActiveChannel {
  channelId: string;
  name: string;
  memberCount: number;
  userLimit: number;
  bitrate: number;
  categoryId: string | null;
  createdAt: string;
  members: { id: string; username: string; displayName: string; avatar: string | null }[];
}

// ── Component ────────────────────────────────────────────

export default function TempVCActiveTab({ guildId }: { guildId: string }) {
  const canManage = useCanManage("tempvc.manage_channels");

  const [stats, setStats] = useState<TempVCStats | null>(null);
  const [channels, setChannels] = useState<ActiveChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActiveChannel | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, statsRes] = await Promise.all([
        fetchApi<ActiveChannel[]>(guildId, "tempvc/active?includeDetails=true", { skipCache: true }),
        fetchApi<TempVCStats>(guildId, "tempvc/stats", { skipCache: true }),
      ]);

      if (activeRes.success) {
        const raw = activeRes.data as any;
        setChannels(Array.isArray(raw) ? raw : (raw?.channels ?? []));
      }
      if (statsRes.success) {
        setStats(statsRes.data ?? null);
      }
      if (!activeRes.success && !statsRes.success) {
        setError("Failed to load Temp VC data");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeEvent("tempvc:updated", () => {
    fetchData();
  });

  // ── Force-delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, `tempvc/channels/${deleteTarget.channelId}`, {
        method: "DELETE",
      });
      if (res.success) {
        toast.success(`Deleted channel ${deleteTarget.name}`);
        setChannels((chs) => chs.filter((c) => c.channelId !== deleteTarget.channelId));
        setDeleteTarget(null);
      } else {
        toast.error(res.error?.message ?? "Failed to delete channel");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  // ── Helpers ──
  function formatDuration(seconds: number): string {
    if (!seconds || seconds < 0) return "0s";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  function formatAge(createdAt: string): string {
    const now = Date.now();
    const created = new Date(createdAt).getTime();
    const seconds = (now - created) / 1000;
    return formatDuration(seconds);
  }

  // ====== Loading ======
  if (loading && channels.length === 0 && !stats) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading active channels…" />
      </div>
    );
  }

  // ====== Error ======
  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchData} className="mt-3 rounded-lg bg-white/5 backdrop-blur-sm px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10">
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Active Channels" value={String(stats.totalActive ?? 0)} />
          <StatCard label="Total Created" value={String(stats.totalCreated)} />
          <StatCard label="Avg. Lifetime" value={formatDuration(stats.avgLifetimeSeconds)} />
        </div>
      )}

      {/* Active channels */}
      {channels.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 p-4">
            <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-8.464a5 5 0 000 7.072" />
            </svg>
          </div>
          <CardTitle>No Active Temp Channels</CardTitle>
          <CardDescription className="mt-2 max-w-md">When a user joins a creator channel, a temporary voice channel will appear here.</CardDescription>
          <button onClick={fetchData} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Active Channels ({channels.length ?? 0})</CardTitle>
            <button onClick={fetchData} className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200" title="Refresh">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <CardContent className="mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700/30 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                    <th className="pb-3 pr-4">Channel</th>
                    <th className="pb-3 pr-4">Members</th>
                    <th className="pb-3 pr-4">Limit</th>
                    <th className="pb-3 pr-4">Age</th>
                    {canManage && <th className="pb-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700/30">
                  {channels.map((ch) => (
                    <tr key={ch.channelId} className="group">
                      <td className="py-3 pr-4">
                        <span className="text-zinc-200">{ch.name}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-zinc-400">{ch.memberCount}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-zinc-400">{ch.userLimit || "∞"}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-zinc-400">{formatAge(ch.createdAt)}</span>
                      </td>
                      {canManage && (
                        <td className="py-3 text-right">
                          <button
                            onClick={() => setDeleteTarget(ch)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 opacity-0 transition hover:bg-red-500/10 group-hover:opacity-100"
                            title="Force delete this temp channel">
                            Force Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Force Delete Channel"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deleting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {deleting ? "Deleting…" : "Force Delete"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">
          Are you sure you want to force-delete <span className="font-medium text-zinc-200">{deleteTarget?.name}</span>? This will immediately remove the voice channel from Discord. All members will
          be disconnected.
        </p>
      </Modal>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-zinc-100">{value}</p>
      </CardContent>
    </Card>
  );
}
