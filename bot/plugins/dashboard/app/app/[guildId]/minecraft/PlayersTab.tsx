/**
 * Players tab — Full player management with:
 *  - Status filter (all / whitelisted / pending / revoked / linked / unlinked)
 *  - Pending-requests banner with bulk-approve
 *  - DataTable with per-row action menu (approve / reject / revoke / whitelist / unwhitelist)
 *  - Reject & Revoke open a reason modal
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import { fetchApi } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Player {
  _id: string;
  guildId: string;
  minecraftUsername: string;
  minecraftUuid?: string;
  discordId?: string;
  discordUsername?: string;
  discordDisplayName?: string;
  whitelistedAt?: string | null;
  linkedAt?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
  rejectionReason?: string | null;
  approvedBy?: string | null;
  authCode?: string | null;
  confirmedAt?: string | null;
  source?: string;
  notes?: string;
  createdAt?: string;
}

interface PlayersResponse {
  players: Player[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

interface PendingResponse {
  requests: Player[];
  total: number;
}

type StatusFilter = "all" | "whitelisted" | "pending" | "revoked" | "linked" | "unlinked";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Players" },
  { value: "whitelisted", label: "Whitelisted" },
  { value: "pending", label: "Pending" },
  { value: "revoked", label: "Revoked" },
  { value: "linked", label: "Linked" },
  { value: "unlinked", label: "Unlinked" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function playerWhitelistStatus(p: Player): "whitelisted" | "pending" | "revoked" | "none" {
  if (p.revokedAt) return "revoked";
  if (p.whitelistedAt) return "whitelisted";
  if (p.linkedAt && !p.whitelistedAt) return "pending";
  return "none";
}

function playerLinkStatus(p: Player): "linked" | "unlinked" {
  return p.discordId && p.linkedAt ? "linked" : "unlinked";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayersTab({ guildId }: { guildId: string }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [pending, setPending] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);

  // Action feedback
  const [actionLoading, setActionLoading] = useState<string | null>(null); // playerId that is loading
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Reason modal
  const [reasonModal, setReasonModal] = useState<{ playerId: string; action: "reject" | "revoke"; username: string } | null>(null);
  const [reason, setReason] = useState("");

  // Action menu
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close action menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- Fetch data ----
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const statusQuery = statusFilter !== "all" ? `&status=${statusFilter}` : "";
      const [playersRes, pendingRes] = await Promise.all([fetchApi<PlayersResponse>(guildId, `minecraft/players?limit=100${statusQuery}`), fetchApi<PendingResponse>(guildId, "minecraft/pending")]);

      if (playersRes.success && playersRes.data) {
        setPlayers(playersRes.data.players);
      }
      if (pendingRes.success && pendingRes.data) {
        setPending(pendingRes.data.requests);
      }
    } catch {
      setError("Failed to load player data");
    } finally {
      setLoading(false);
    }
  }, [guildId, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Actions ----

  const doAction = async (playerId: string, endpoint: string, method: string, body?: unknown) => {
    setActionLoading(playerId);
    setOpenMenu(null);

    try {
      const res = await fetchApi<Player>(guildId, endpoint, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (res.success) {
        setToast({ msg: "Action completed successfully", type: "success" });
        await fetchData();
      } else {
        setToast({ msg: res.error?.message ?? "Action failed", type: "error" });
      }
    } catch {
      setToast({ msg: "Failed to connect to API", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = (id: string) => doAction(id, `minecraft/approve/${id}`, "POST");
  const handleWhitelist = (id: string) => doAction(id, `minecraft/players/${id}/whitelist`, "POST");
  const handleUnwhitelist = (id: string) => doAction(id, `minecraft/players/${id}/unwhitelist`, "POST");

  const openRejectModal = (player: Player) => {
    setReasonModal({ playerId: player._id, action: "reject", username: player.minecraftUsername });
    setReason("");
    setOpenMenu(null);
  };

  const openRevokeModal = (player: Player) => {
    setReasonModal({ playerId: player._id, action: "revoke", username: player.minecraftUsername });
    setReason("");
    setOpenMenu(null);
  };

  const submitReason = async () => {
    if (!reasonModal) return;
    const { playerId, action } = reasonModal;

    if (action === "reject") {
      await doAction(playerId, `minecraft/players/${playerId}/reject`, "POST", { reason });
    } else {
      await doAction(playerId, `minecraft/players/${playerId}`, "DELETE", { reason });
    }
    setReasonModal(null);
  };

  const handleBulkApprove = async () => {
    if (pending.length === 0) return;
    setActionLoading("bulk");

    try {
      const res = await fetchApi<{ modifiedCount: number }>(guildId, "minecraft/bulk-approve", {
        method: "POST",
        body: JSON.stringify({ playerIds: pending.map((p) => p._id) }),
      });

      if (res.success) {
        setToast({ msg: `Approved ${pending.length} player(s)`, type: "success" });
        await fetchData();
      } else {
        setToast({ msg: res.error?.message ?? "Bulk approve failed", type: "error" });
      }
    } catch {
      setToast({ msg: "Failed to connect to API", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // ---- Columns ----

  const columns: Column<Player>[] = [
    {
      key: "minecraftUsername",
      header: "Minecraft",
      render: (row) => (
        <div className="flex items-center gap-2">
          <img src={`https://mc-heads.net/avatar/${row.minecraftUuid ?? row.minecraftUsername}/24`} alt="" className="h-6 w-6 rounded" />
          <span className="font-medium text-zinc-100">{row.minecraftUsername}</span>
        </div>
      ),
    },
    {
      key: "discordUsername",
      header: "Discord",
      render: (row) => <span className="text-zinc-300">{row.discordUsername ?? row.discordDisplayName ?? <span className="text-zinc-600">Not linked</span>}</span>,
    },
    {
      key: "linkStatus",
      header: "Link",
      render: (row) => {
        const status = playerLinkStatus(row);
        return <StatusBadge variant={status === "linked" ? "success" : "neutral"}>{status}</StatusBadge>;
      },
    },
    {
      key: "whitelistStatus",
      header: "Whitelist",
      render: (row) => {
        const ws = playerWhitelistStatus(row);
        const variants: Record<string, "success" | "warning" | "error" | "neutral"> = {
          whitelisted: "success",
          pending: "warning",
          revoked: "error",
          none: "neutral",
        };
        return <StatusBadge variant={variants[ws] ?? "neutral"}>{ws}</StatusBadge>;
      },
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (row) => {
        const ws = playerWhitelistStatus(row);
        const isLoading = actionLoading === row._id;

        if (isLoading) {
          return (
            <div className="flex justify-center">
              <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          );
        }

        return (
          <div className="relative" ref={openMenu === row._id ? menuRef : undefined}>
            <button onClick={() => setOpenMenu(openMenu === row._id ? null : row._id)} className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>

            {openMenu === row._id && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                {ws === "pending" && (
                  <>
                    <MenuButton onClick={() => handleApprove(row._id)} color="emerald">
                      ✓ Approve
                    </MenuButton>
                    <MenuButton onClick={() => openRejectModal(row)} color="red">
                      ✕ Reject
                    </MenuButton>
                  </>
                )}
                {ws === "whitelisted" && (
                  <MenuButton onClick={() => handleUnwhitelist(row._id)} color="amber">
                    Remove Whitelist
                  </MenuButton>
                )}
                {ws === "none" && (
                  <MenuButton onClick={() => handleWhitelist(row._id)} color="emerald">
                    Whitelist
                  </MenuButton>
                )}
                {ws !== "revoked" && (
                  <MenuButton onClick={() => openRevokeModal(row)} color="red">
                    Revoke
                  </MenuButton>
                )}
                {ws === "revoked" && (
                  <MenuButton onClick={() => handleWhitelist(row._id)} color="emerald">
                    Restore
                  </MenuButton>
                )}
              </div>
            )}
          </div>
        );
      },
    },
  ];

  // ====== Render ======

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading players…" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${toast.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
          {toast.msg}
        </div>
      )}

      {/* Pending requests banner */}
      {pending.length > 0 && statusFilter !== "revoked" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>{pending.length}</strong> pending whitelist request{pending.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={handleBulkApprove}
            disabled={actionLoading === "bulk"}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 disabled:opacity-50">
            {actionLoading === "bulk" ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            Approve All
          </button>
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === f.value ? "bg-primary-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Player table */}
      <DataTable
        columns={columns}
        data={players}
        searchKeys={["minecraftUsername", "discordUsername" as keyof Player]}
        searchPlaceholder="Search players..."
        loading={false}
        emptyMessage="No players found for this filter."
      />

      {/* Reason modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">
              {reasonModal.action === "reject" ? "Reject" : "Revoke"} — {reasonModal.username}
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              {reasonModal.action === "reject" ? "Provide a reason for rejecting this whitelist request." : "Provide a reason for revoking this player's access."}
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason…"
              className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setReasonModal(null)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800">
                Cancel
              </button>
              <button
                onClick={submitReason}
                disabled={!reason.trim() || actionLoading === reasonModal.playerId}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading === reasonModal.playerId ? "Processing…" : reasonModal.action === "reject" ? "Reject" : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action menu button
// ---------------------------------------------------------------------------

function MenuButton({ onClick, color, children }: { onClick: () => void; color: "emerald" | "red" | "amber"; children: React.ReactNode }) {
  const colorClasses = {
    emerald: "hover:bg-emerald-500/10 text-emerald-400",
    red: "hover:bg-red-500/10 text-red-400",
    amber: "hover:bg-amber-500/10 text-amber-400",
  };

  return (
    <button onClick={onClick} className={`w-full px-4 py-2 text-left text-sm transition ${colorClasses[color]}`}>
      {children}
    </button>
  );
}
