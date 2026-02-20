/**
 * Players tab — PlanetSide 2 linked player management.
 *
 * - Server-side search with debounce
 * - Status filter (all/linked/pending/revoked)
 * - Pagination
 * - Per-row actions (approve, revoke, delete)
 * - Manual link
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";
import { RowActionMenu, RowActionItem, RowActionSeparator } from "@/components/ui/RowActionMenu";

// ── PS2 Constants (frontend mirror) ────────────────────────────

const FACTION_NAMES: Record<number, string> = {
  0: "No Faction",
  1: "Vanu Sovereignty",
  2: "New Conglomerate",
  3: "Terran Republic",
  4: "NSO",
};

const FACTION_SHORT: Record<number, string> = {
  0: "—",
  1: "VS",
  2: "NC",
  3: "TR",
  4: "NSO",
};

const FACTION_COLORS: Record<number, string> = {
  0: "text-zinc-400",
  1: "text-purple-400",
  2: "text-blue-400",
  3: "text-red-400",
  4: "text-zinc-300",
};

const SERVER_NAMES: Record<number, string> = {
  1: "Osprey",
  10: "Wainwright",
  19: "Jaeger",
  40: "SolTech",
};

// ── Types ──────────────────────────────────────────────────────

interface PS2Player {
  _id: string;
  guildId: string;
  discordId: string;
  characterId: string;
  characterName: string;
  factionId?: number;
  serverId?: number;
  battleRank?: number;
  prestige?: number;
  outfitId?: string;
  outfitTag?: string;
  outfitName?: string;
  discordUsername?: string;
  discordDisplayName?: string;
  linkedAt?: string;
  verifiedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokeReason?: string;
  verificationStartedAt?: string;
  verificationStatus?: string;
  verificationMethod?: string;
  source?: string;
  createdAt?: string;
}

interface PlayersResponse {
  players: PS2Player[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

type StatusFilter = "all" | "linked" | "pending" | "revoked" | "verified";

// ── Component ──────────────────────────────────────────────────

export default function PlayersTab({ guildId, defaultFilter }: { guildId: string; defaultFilter?: string }) {
  const [players, setPlayers] = useState<PS2Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>((defaultFilter as StatusFilter) || "all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Action modals
  const [revokeTarget, setRevokeTarget] = useState<PS2Player | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PS2Player | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Manual link
  const [showManualLink, setShowManualLink] = useState(false);
  const [manualForm, setManualForm] = useState({ characterName: "", characterId: "", discordId: "", factionId: 0, serverId: 0 });

  // Active action menu (stores row id + trigger element for portal positioning)
  const [menuState, setMenuState] = useState<{ id: string; el: HTMLButtonElement } | null>(null);

  // ── Fetch players ──────────────────────────────────────────

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetchApi<PlayersResponse>(guildId, `planetside/players?${params.toString()}`);

      if (res.success && res.data) {
        setPlayers(res.data.players);
        setPagination(res.data.pagination);
      } else if (res.error?.code === "FORBIDDEN" || res.error?.code === "UNAUTHORIZED") {
        setError("Access denied: You don't have permission to view players");
      } else {
        setError(res.error?.message ?? "Failed to load players");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId, statusFilter, search, page]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  useRealtimeEvent("planetside:player_linked", () => fetchPlayers());
  useRealtimeEvent("planetside:link_requested", () => fetchPlayers());
  useRealtimeEvent("planetside:player_unlinked", () => fetchPlayers());

  // ── Debounced search ──────────────────────────────────────

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
    }, 400);
  };

  // ── Actions ────────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setActionLoading(true);
    try {
      const res = await fetchApi(guildId, `planetside/players/${revokeTarget._id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason: revokeReason || "Revoked via dashboard" }),
      });
      if (res.success) {
        toast.success(`Revoked ${revokeTarget.characterName}`);
        setRevokeTarget(null);
        setRevokeReason("");
        fetchPlayers();
      } else {
        toast.error(res.error?.message ?? "Failed to revoke");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      const res = await fetchApi(guildId, `planetside/players/${deleteTarget._id}/permanent`, {
        method: "DELETE",
      });
      if (res.success) {
        toast.success(`Deleted ${deleteTarget.characterName}`);
        setDeleteTarget(null);
        fetchPlayers();
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualLink = async () => {
    setActionLoading(true);
    try {
      const res = await fetchApi(guildId, "planetside/players/manual", {
        method: "POST",
        body: JSON.stringify(manualForm),
      });
      if (res.success) {
        toast.success(`Linked ${manualForm.characterName || manualForm.characterId}`);
        setShowManualLink(false);
        setManualForm({ characterName: "", characterId: "", discordId: "", factionId: 0, serverId: 0 });
        fetchPlayers();
      } else {
        toast.error(res.error?.message ?? "Failed to link player");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────

  function getPlayerStatus(player: PS2Player): { label: string; variant: "success" | "warning" | "error" | "info" | "neutral" } {
    if (player.revokedAt) return { label: "Revoked", variant: "error" };
    if (player.linkedAt && player.verifiedAt) return { label: "Verified", variant: "success" };
    if (player.linkedAt) return { label: "Linked", variant: "info" };
    if (player.verificationStartedAt) return { label: "Pending", variant: "warning" };
    return { label: "Unknown", variant: "neutral" };
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatBattleRank(br?: number, prestige?: number): string {
    if (!br) return "—";
    const asp = prestige && prestige > 0 ? ` ASP ${prestige}` : "";
    return `BR ${br}${asp}`;
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {(["all", "linked", "pending", "verified", "revoked"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => {
                setStatusFilter(f);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === f ? "bg-indigo-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              }`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by name or Discord ID…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="rounded-md border border-zinc-700/50 bg-white/5 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <button onClick={() => setShowManualLink(true)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors">
            + Manual Link
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading players…" />
        </div>
      ) : error ? (
        <Card>
          <CardContent>
            <p className="text-sm text-red-400">{error}</p>
          </CardContent>
        </Card>
      ) : players.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-zinc-400">
              {search.trim()
                ? "No players match your search."
                : statusFilter !== "all"
                  ? `No ${statusFilter} players found.`
                  : "No players linked yet. Players can link via the /ps2-link command or the account panel."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-zinc-700/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700/30 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-zinc-400">
                  <th className="px-4 py-3">Character</th>
                  <th className="px-4 py-3">Faction</th>
                  <th className="px-4 py-3">Server</th>
                  <th className="px-4 py-3">Discord</th>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Linked</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700/20">
                {players.map((player) => {
                  const status = getPlayerStatus(player);
                  return (
                    <tr key={player._id} className="transition-colors hover:bg-white/[0.03]">
                      <td className="px-4 py-3 font-medium text-zinc-100">
                        <div className="flex items-center gap-2">
                          {player.outfitTag && <span className="text-xs text-zinc-500">[{player.outfitTag}]</span>}
                          {player.characterName}
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${FACTION_COLORS[player.factionId ?? 0] ?? "text-zinc-400"}`}>{FACTION_SHORT[player.factionId ?? 0] ?? "?"}</td>
                      <td className="px-4 py-3 text-zinc-300">{SERVER_NAMES[player.serverId ?? 0] ?? "—"}</td>
                      <td className="px-4 py-3 text-zinc-300">
                        <div>
                          <span className="text-zinc-200">{player.discordDisplayName || player.discordUsername || "—"}</span>
                          {player.discordId && <span className="ml-1 text-xs text-zinc-500">{player.discordId}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{formatBattleRank(player.battleRank, player.prestige)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{formatDate(player.linkedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) =>
                            setMenuState((prev) => (prev?.id === player._id ? null : { id: player._id, el: e.currentTarget }))
                          }
                          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors">
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action menu portal — rendered once outside the table, driven by menuState */}
          {(() => {
            const activePlayer = players.find((p) => p._id === menuState?.id) ?? null;
            return (
              <RowActionMenu open={!!menuState} anchorEl={menuState?.el ?? null} onClose={() => setMenuState(null)}>
                {activePlayer && !activePlayer.revokedAt && activePlayer.linkedAt && (
                  <RowActionItem variant="warning" onClick={() => { setRevokeTarget(activePlayer); setMenuState(null); }}>Revoke Link</RowActionItem>
                )}
                {activePlayer && (
                  <RowActionItem variant="danger" onClick={() => { setDeleteTarget(activePlayer); setMenuState(null); }}>Delete Record</RowActionItem>
                )}
              </RowActionMenu>
            );
          })()}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span>
                Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="rounded px-3 py-1 hover:bg-white/10 disabled:opacity-30">
                  ← Prev
                </button>
                <button onClick={() => setPage(Math.min(pagination.pages, page + 1))} disabled={page >= pagination.pages} className="rounded px-3 py-1 hover:bg-white/10 disabled:opacity-30">
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Revoke Modal */}
      <Modal
        open={!!revokeTarget}
        onClose={() => {
          setRevokeTarget(null);
          setRevokeReason("");
        }}
        title={`Revoke ${revokeTarget?.characterName ?? ""}`}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            This will revoke the link for <strong>{revokeTarget?.characterName}</strong> and remove any assigned roles.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Reason (optional)</label>
            <input
              type="text"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g. Left outfit"
              className="w-full rounded-md border border-zinc-700/50 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason("");
              }}
              className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button onClick={handleRevoke} disabled={actionLoading} className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50">
              {actionLoading ? "Revoking…" : "Revoke"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`Delete ${deleteTarget?.characterName ?? ""}`}>
        <div className="space-y-4">
          <p className="text-sm text-red-400">
            This will <strong>permanently delete</strong> the record for <strong>{deleteTarget?.characterName}</strong>. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={actionLoading} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
              {actionLoading ? "Deleting…" : "Delete Permanently"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Manual Link Modal */}
      <Modal open={showManualLink} onClose={() => setShowManualLink(false)} title="Manual Player Link">
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Manually link a PlanetSide 2 character to a Discord user. The character will be marked as verified immediately.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Character Name</label>
              <input
                type="text"
                value={manualForm.characterName}
                onChange={(e) => setManualForm((f) => ({ ...f, characterName: e.target.value }))}
                placeholder="e.g. Wrel"
                className="w-full rounded-md border border-zinc-700/50 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Character ID</label>
              <input
                type="text"
                value={manualForm.characterId}
                onChange={(e) => setManualForm((f) => ({ ...f, characterId: e.target.value }))}
                placeholder="Census character ID"
                className="w-full rounded-md border border-zinc-700/50 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Discord User ID</label>
              <input
                type="text"
                value={manualForm.discordId}
                onChange={(e) => setManualForm((f) => ({ ...f, discordId: e.target.value }))}
                placeholder="e.g. 234439833802637312"
                className="w-full rounded-md border border-zinc-700/50 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Faction</label>
              <select
                value={manualForm.factionId}
                onChange={(e) => setManualForm((f) => ({ ...f, factionId: Number(e.target.value) }))}
                className="w-full rounded-md border border-zinc-700/50 bg-white/5 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500">
                {Object.entries(FACTION_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-400">Server</label>
              <select
                value={manualForm.serverId}
                onChange={(e) => setManualForm((f) => ({ ...f, serverId: Number(e.target.value) }))}
                className="w-full rounded-md border border-zinc-700/50 bg-white/5 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500">
                <option value={0}>Select server…</option>
                {Object.entries(SERVER_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowManualLink(false)} className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button
              onClick={handleManualLink}
              disabled={actionLoading || (!manualForm.characterName && !manualForm.characterId) || !manualForm.discordId}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              {actionLoading ? "Linking…" : "Link Player"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
