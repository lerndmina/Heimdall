/**
 * Players tab — Full player management with:
 *  - Server-side search with debounce
 *  - Pagination with configurable page-size (saved to localStorage)
 *  - Status filter (all / whitelisted / pending / revoked / linked / unlinked)
 *  - Pending-requests banner with bulk-approve
 *  - Per-row action menu (approve / revoke / whitelist / unwhitelist / edit)
 *  - Add & Edit player modals
 *  - Revoke opens a reason modal
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import StatusBadge from "@/components/ui/StatusBadge";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

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

type StatusFilter = "all" | "whitelisted" | "pending" | "revoked" | "linked" | "unlinked" | "unconfirmed";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Players" },
  { value: "whitelisted", label: "Whitelisted" },
  { value: "pending", label: "Pending" },
  { value: "unconfirmed", label: "Unconfirmed" },
  { value: "revoked", label: "Revoked" },
  { value: "linked", label: "Linked" },
  { value: "unlinked", label: "Unlinked" },
];

const PAGE_SIZE_OPTIONS = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 250, label: "250" },
  { value: 500, label: "500" },
  { value: 750, label: "750" },
  { value: 1000, label: "1000" },
  { value: "all", label: "All" },
];

type PageSizeValue = number | "all";

const LS_KEY_PAGE_SIZE = "mc-players-page-size";

function getSavedPageSize(): PageSizeValue {
  if (typeof window === "undefined") return 50;
  const v = localStorage.getItem(LS_KEY_PAGE_SIZE);
  if (v === null) return 50;
  if (v === "all") return "all";
  const n = Number(v);
  return PAGE_SIZE_OPTIONS.some((o) => o.value === n) ? n : 50;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function playerWhitelistStatus(p: Player): "whitelisted" | "pending" | "revoked" | "none" {
  if (p.revokedAt) return "revoked";
  if (p.whitelistedAt) return "whitelisted";
  if (p.linkedAt && !p.whitelistedAt) return "pending";
  return "none";
}

function playerLinkStatus(p: Player): "linked" | "confirming" | "unlinked" {
  if (p.discordId && p.linkedAt) return "linked";
  if (p.authCode && !p.confirmedAt && !p.linkedAt) return "confirming";
  return "unlinked";
}

// ---------------------------------------------------------------------------
// Player form shape (shared by add + edit)
// ---------------------------------------------------------------------------
interface PlayerForm {
  minecraftUsername: string;
  minecraftUuid: string;
  discordId: string;
  discordUsername: string;
  discordDisplayName: string;
  status: "pending" | "whitelisted" | "revoked";
  revocationReason: string;
  notes: string;
}

const EMPTY_FORM: PlayerForm = {
  minecraftUsername: "",
  minecraftUuid: "",
  discordId: "",
  discordUsername: "",
  discordDisplayName: "",
  status: "pending",
  revocationReason: "",
  notes: "",
};

function playerToForm(p: Player): PlayerForm {
  const ws = playerWhitelistStatus(p);
  return {
    minecraftUsername: p.minecraftUsername ?? "",
    minecraftUuid: p.minecraftUuid ?? "",
    discordId: p.discordId ?? "",
    discordUsername: p.discordUsername ?? "",
    discordDisplayName: p.discordDisplayName ?? "",
    status: ws === "none" ? "pending" : ws,
    revocationReason: p.revocationReason ?? "",
    notes: p.notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayersTab({ guildId, defaultFilter }: { guildId: string; defaultFilter?: string }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [pending, setPending] = useState<Player[]>([]);
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>((defaultFilter as StatusFilter) || "all");
  const [error, setError] = useState<string | null>(null);

  // Server-side search + debounce
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeValue>(getSavedPageSize);
  const [pagination, setPagination] = useState<{ total: number; pages: number }>({ total: 0, pages: 1 });

  // Action feedback
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Reason modal
  const [reasonModal, setReasonModal] = useState<{ playerId: string; username: string } | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ playerId: string; username: string } | null>(null);
  const [reason, setReason] = useState("");

  // Import whitelist modal
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"file" | "paste">("file");
  const [importJson, setImportJson] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number; imported: number; skipped: number; overwritten: number; errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add / Edit player modal
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerModalMode, setPlayerModalMode] = useState<"add" | "edit">("add");
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerForm, setPlayerForm] = useState<PlayerForm>({ ...EMPTY_FORM });
  const [playerFormLoading, setPlayerFormLoading] = useState(false);

  // Action menu
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; bottom: number; right: number } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Bulk approve modal
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkApproveCount, setBulkApproveCount] = useState(0);
  const [bulkApproveLoading, setBulkApproveLoading] = useState(false);
  const [bulkApprovedIds, setBulkApprovedIds] = useState<string[]>([]);
  const [bulkApprovedNames, setBulkApprovedNames] = useState<string[]>([]);
  const [bulkRevertLoading, setBulkRevertLoading] = useState(false);

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

  // Close action menu on scroll (prevents misplaced portals)
  useEffect(() => {
    function handleScroll() {
      if (openMenu) setOpenMenu(null);
    }
    window.addEventListener("scroll", handleScroll, true);
    const tableEl = tableScrollRef.current;
    if (tableEl) tableEl.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      if (tableEl) tableEl.removeEventListener("scroll", handleScroll, true);
    };
  }, [openMenu]);

  // Debounce search input → searchQuery
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize]);

  // ---- Fetch data ----
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      if (pageSize !== "all") params.set("page", String(page));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const [playersRes, pendingRes, unconfirmedRes] = await Promise.all([
        fetchApi<PlayersResponse>(guildId, `minecraft/players?${params.toString()}`),
        fetchApi<PendingResponse>(guildId, "minecraft/pending"),
        fetchApi<PlayersResponse>(guildId, "minecraft/players?status=unconfirmed&limit=1"),
      ]);

      if (playersRes.success && playersRes.data) {
        setPlayers(playersRes.data.players);
        setPagination({ total: playersRes.data.pagination.total, pages: playersRes.data.pagination.pages });
      }
      if (pendingRes.success && pendingRes.data) {
        setPending(pendingRes.data.requests);
      }
      if (unconfirmedRes.success && unconfirmedRes.data) {
        setUnconfirmedCount(unconfirmedRes.data.pagination.total);
      }

      // Check for permission errors
      if (!playersRes.success && (playersRes.error?.code === "FORBIDDEN" || playersRes.error?.code === "UNAUTHORIZED" || playersRes.error?.message?.toLowerCase().includes("permission"))) {
        setError("Access denied: You don't have permission to view player data");
      }
    } catch {
      setError("Failed to load player data");
    } finally {
      setLoading(false);
    }
  }, [guildId, statusFilter, searchQuery, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeEvent("minecraft:updated", () => {
    fetchData();
  });

  // ---- Actions ----

  const doAction = async (playerId: string, endpoint: string, method: string, body?: unknown, opts?: { description?: string; undo?: { endpoint: string; method: string; body?: unknown } }) => {
    setActionLoading(playerId);
    setOpenMenu(null);

    try {
      const res = await fetchApi<Player>(guildId, endpoint, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (res.success) {
        const msg = opts?.description ?? "Action completed successfully";
        if (opts?.undo) {
          const undo = opts.undo;
          toast.success(msg, {
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  const undoRes = await fetchApi(guildId, undo.endpoint, {
                    method: undo.method,
                    ...(undo.body ? { body: JSON.stringify(undo.body) } : {}),
                  });
                  if (undoRes.success) {
                    toast.success("Action undone");
                    await fetchData();
                  } else {
                    toast.error("Failed to undo");
                  }
                } catch {
                  toast.error("Failed to undo");
                }
              },
            },
          });
        } else {
          toast.success(msg);
        }
        await fetchData();
      } else {
        toast.error(res.error?.message ?? "Action failed");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = (id: string) =>
    doAction(id, `minecraft/approve/${id}`, "POST", undefined, {
      description: "Player approved",
    });

  const handleWhitelist = (id: string) =>
    doAction(id, `minecraft/players/${id}/whitelist`, "POST", undefined, {
      description: "Player whitelisted",
      undo: { endpoint: `minecraft/players/${id}/unwhitelist`, method: "POST" },
    });

  const handleUnwhitelist = (id: string) =>
    doAction(id, `minecraft/players/${id}/unwhitelist`, "POST", undefined, {
      description: "Whitelist removed",
      undo: { endpoint: `minecraft/players/${id}/whitelist`, method: "POST" },
    });

  const openRevokeModal = (player: Player) => {
    setReasonModal({ playerId: player._id, username: player.minecraftUsername });
    setReason("");
    setOpenMenu(null);
  };

  const submitReason = async () => {
    if (!reasonModal) return;
    const { playerId, username } = reasonModal;

    await doAction(
      playerId,
      `minecraft/players/${playerId}`,
      "DELETE",
      { reason },
      {
        description: `Revoked ${username}`,
        undo: { endpoint: `minecraft/players/${playerId}/whitelist`, method: "POST" },
      },
    );
    setReasonModal(null);
  };

  const openDeleteConfirmModal = (player: Player) => {
    setDeleteConfirmModal({ playerId: player._id, username: player.minecraftUsername });
    setOpenMenu(null);
  };

  const submitDeletePermanent = async () => {
    if (!deleteConfirmModal) return;
    const { playerId, username } = deleteConfirmModal;
    await doAction(playerId, `minecraft/players/${playerId}/permanent`, "DELETE", undefined, {
      description: `Permanently deleted ${username}`,
    });
    setDeleteConfirmModal(null);
  };

  const openActionMenu = (rowId: string, target: HTMLButtonElement) => {
    const rect = target.getBoundingClientRect();
    const menuWidth = 176; // matches w-44
    const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);
    setMenuAnchor({ top: rect.top, bottom: rect.bottom, right: rect.right });
    setMenuPosition({ top: rect.bottom + 6, left });
    setMenuVisible(false);
    setOpenMenu(rowId);
  };

  useEffect(() => {
    if (!openMenu || !menuAnchor || !menuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const menuWidth = menuRect.width || 176;
    const menuHeight = menuRect.height || 0;
    const left = Math.min(Math.max(8, menuAnchor.right - menuWidth), window.innerWidth - menuWidth - 8);
    const below = menuAnchor.bottom + 6;
    const above = menuAnchor.top - menuHeight - 6;
    const top = below + menuHeight > window.innerHeight - 8 ? Math.max(8, above) : below;
    setMenuPosition({ top, left });
    setMenuVisible(true);
  }, [openMenu, menuAnchor]);

  // ---- Import whitelist ----
  const handleImport = async () => {
    setImportLoading(true);
    setImportProgress(null);
    try {
      const parseJsonInput = (raw: string): unknown => {
        const trimmed = raw.trim();
        if (!trimmed) throw new Error("empty");

        try {
          return JSON.parse(trimmed);
        } catch {
          // Try NDJSON (mongoexport)
          const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
          if (lines.length === 0) throw new Error("empty");
          return lines.map((line) => JSON.parse(line));
        }
      };

      let parsed: unknown;

      if (importMode === "file") {
        if (!importFile) {
          toast.error("Please select a file");
          setImportLoading(false);
          return;
        }
        const text = await importFile.text();
        try {
          parsed = parseJsonInput(text);
        } catch {
          toast.error("Invalid JSON in file (array, { players: [...] }, or NDJSON)");
          setImportLoading(false);
          return;
        }
      } else {
        if (!importJson.trim()) {
          toast.error("Please paste whitelist JSON");
          setImportLoading(false);
          return;
        }
        try {
          parsed = parseJsonInput(importJson);
        } catch {
          toast.error("Invalid JSON (array, { players: [...] }, or NDJSON)");
          setImportLoading(false);
          return;
        }
      }

      const parsedList = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed && Array.isArray((parsed as { players?: unknown[] }).players)
          ? (parsed as { players: unknown[] }).players
          : null;

      if (!parsedList || parsedList.length === 0) {
        toast.error("JSON must be a non-empty array (or { players: [...] })");
        setImportLoading(false);
        return;
      }

      // Send in batches for progress tracking
      const BATCH_SIZE = 100;
      const totals = { imported: 0, skipped: 0, overwritten: 0, errors: 0 };
      const total = parsedList.length;
      let processed = 0;

      setImportProgress({ processed: 0, total, ...totals });

      for (let i = 0; i < parsedList.length; i += BATCH_SIZE) {
        const batch = parsedList.slice(i, i + BATCH_SIZE);
        const res = await fetchApi<{ imported: number; skipped: number; overwritten: number; errors: number }>(guildId, "minecraft/import-whitelist", {
          method: "POST",
          body: JSON.stringify({ players: batch, mode: importOverwrite ? "overwrite" : "skip" }),
        });

        if (res.success && res.data) {
          totals.imported += res.data.imported;
          totals.skipped += res.data.skipped;
          totals.overwritten += res.data.overwritten ?? 0;
          totals.errors += res.data.errors;
        } else {
          totals.errors += batch.length;
        }

        processed += batch.length;
        setImportProgress({ processed, total, ...totals });
      }

      const { imported, skipped, overwritten, errors } = totals;
      const parts = [`Imported ${imported}`];
      if (overwritten > 0) parts.push(`overwritten ${overwritten}`);
      parts.push(`skipped ${skipped}`);
      parts.push(`errors ${errors}`);
      if (errors > 0) {
        toast.error(parts.join(", "));
      } else {
        toast.success(parts.join(", "));
      }
      setImportOpen(false);
      setImportJson("");
      setImportFile(null);
      setImportProgress(null);
      await fetchData();
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setImportLoading(false);
      setImportProgress(null);
    }
  };

  // ---- Add / Edit player ----
  const openAddModal = () => {
    setPlayerModalMode("add");
    setEditingPlayerId(null);
    setPlayerForm({ ...EMPTY_FORM });
    setPlayerModalOpen(true);
    setOpenMenu(null);
  };

  const openEditModal = (player: Player) => {
    setPlayerModalMode("edit");
    setEditingPlayerId(player._id);
    setPlayerForm(playerToForm(player));
    setPlayerModalOpen(true);
    setOpenMenu(null);
  };

  const handlePlayerFormSubmit = async () => {
    if (!playerForm.minecraftUsername.trim()) {
      toast.error("Minecraft username is required");
      return;
    }
    setPlayerFormLoading(true);
    try {
      const body: Record<string, unknown> = {
        minecraftUsername: playerForm.minecraftUsername.trim(),
        status: playerForm.status,
      };
      if (playerForm.minecraftUuid.trim()) body.minecraftUuid = playerForm.minecraftUuid.trim();
      if (playerForm.discordId.trim()) body.discordId = playerForm.discordId.trim();
      if (playerForm.discordUsername.trim()) body.discordUsername = playerForm.discordUsername.trim();
      if (playerForm.discordDisplayName.trim()) body.discordDisplayName = playerForm.discordDisplayName.trim();
      if (playerForm.notes.trim()) body.notes = playerForm.notes.trim();
      if (playerForm.status === "revoked" && playerForm.revocationReason.trim()) {
        body.revocationReason = playerForm.revocationReason.trim();
      }

      let res;
      if (playerModalMode === "edit" && editingPlayerId) {
        res = await fetchApi<Player>(guildId, `minecraft/players/${editingPlayerId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        res = await fetchApi<Player>(guildId, "minecraft/players/manual", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      if (res.success) {
        toast.success(playerModalMode === "edit" ? `Updated ${playerForm.minecraftUsername}` : `Added ${playerForm.minecraftUsername}`);
        setPlayerModalOpen(false);
        setPlayerForm({ ...EMPTY_FORM });
        setEditingPlayerId(null);
        await fetchData();
      } else {
        toast.error(res.error?.message ?? `Failed to ${playerModalMode} player`);
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setPlayerFormLoading(false);
    }
  };

  const openBulkApproveModal = () => {
    if (pending.length === 0) return;
    setBulkApproveCount(pending.length);
    setBulkApprovedIds([]);
    setBulkApprovedNames([]);
    setBulkApproveOpen(true);
  };

  const handleBulkApprove = async () => {
    const count = Math.max(0, Math.min(bulkApproveCount || 0, pending.length));
    if (count === 0) return;

    const targets = pending.slice(0, count);
    const ids = targets.map((p) => p._id);
    const names = targets.map((p) => p.minecraftUsername);

    setBulkApproveLoading(true);
    try {
      const res = await fetchApi<{ approved: number; requested: number }>(guildId, "minecraft/bulk-approve", {
        method: "POST",
        body: JSON.stringify({ playerIds: ids }),
      });

      if (res.success) {
        setBulkApprovedIds(ids);
        setBulkApprovedNames(names);
        toast.success(`Approved ${res.data?.approved ?? ids.length} player(s)`);
        await fetchData();
      } else {
        toast.error(res.error?.message ?? "Bulk approve failed");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setBulkApproveLoading(false);
    }
  };

  const handleBulkRevert = async () => {
    if (bulkApprovedIds.length === 0) return;
    setBulkRevertLoading(true);
    try {
      const res = await fetchApi<{ reverted: number; requested: number }>(guildId, "minecraft/bulk-revert", {
        method: "POST",
        body: JSON.stringify({ playerIds: bulkApprovedIds }),
      });

      if (res.success) {
        toast.success(`Reverted ${res.data?.reverted ?? bulkApprovedIds.length} player(s)`);
        setBulkApprovedIds([]);
        setBulkApprovedNames([]);
        await fetchData();
      } else {
        toast.error(res.error?.message ?? "Bulk revert failed");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setBulkRevertLoading(false);
    }
  };

  // ---- Page size persistence ----
  const handlePageSizeChange = (raw: string) => {
    const newSize: PageSizeValue = raw === "all" ? "all" : Number(raw);
    setPageSize(newSize);
    localStorage.setItem(LS_KEY_PAGE_SIZE, String(newSize));
  };

  // ====== Render ======

  const activeMenuRow = openMenu ? players.find((p) => p._id === openMenu) : undefined;

  if (error && !players.length) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-5">
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
            onClick={openBulkApproveModal}
            disabled={bulkApproveLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 disabled:opacity-50">
            {bulkApproveLoading ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            Approve
          </button>
        </div>
      )}

      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => {
            const badge = f.value === "unconfirmed" && unconfirmedCount > 0 ? unconfirmedCount : null;
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                  statusFilter === f.value ? "bg-primary-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                }`}>
                {f.label}
                {badge && <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-black">{badge}</span>}
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={openAddModal} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-500">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Player
          </button>
          <button
            onClick={() => {
              setImportOpen(true);
              setImportMode("file");
              setImportJson("");
              setImportFile(null);
              setImportOverwrite(false);
              setImportProgress(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/30 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Whitelist
          </button>
        </div>
      </div>

      {/* Search + Page size */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by Minecraft username, Discord username, or Discord ID..."
            className="w-full rounded-lg border border-zinc-700/30 bg-white/5 py-2 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 whitespace-nowrap">Per page</label>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(e.target.value)}
            className="rounded-lg border border-zinc-700/30 bg-white/5 px-2 py-2 text-sm text-zinc-100 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500">
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Player table */}
      <div className="space-y-4">
        <div ref={tableScrollRef} className="overflow-x-auto rounded-lg border border-zinc-700/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/30 bg-white/5">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Minecraft</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Discord</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Link</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Whitelist</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                    <div className="inline-flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                        <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                    No players found for this filter.
                  </td>
                </tr>
              ) : (
                players.map((row) => {
                  const ws = playerWhitelistStatus(row);
                  const ls = playerLinkStatus(row);
                  const isLoading = actionLoading === row._id;
                  const wsVariants: Record<string, "success" | "warning" | "error" | "neutral"> = {
                    whitelisted: "success",
                    pending: "warning",
                    revoked: "error",
                    none: "neutral",
                  };

                  return (
                    <tr key={row._id} className="border-b border-zinc-700/30 transition hover:bg-white/5">
                      {/* Minecraft */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <img src={`https://mc-heads.net/avatar/${row.minecraftUuid ?? row.minecraftUsername}/24`} alt="" className="h-6 w-6 rounded" />
                          <span className="font-medium text-zinc-100">{row.minecraftUsername}</span>
                        </div>
                      </td>
                      {/* Discord */}
                      <td className="px-4 py-3">
                        <span className="text-zinc-300">{row.discordUsername ?? row.discordDisplayName ?? <span className="text-zinc-600">Not linked</span>}</span>
                      </td>
                      {/* Link Status */}
                      <td className="px-4 py-3">
                        <StatusBadge variant={ls === "linked" ? "success" : ls === "confirming" ? "warning" : "neutral"}>{ls}</StatusBadge>
                      </td>
                      {/* Whitelist Status */}
                      <td className="px-4 py-3">
                        <StatusBadge variant={wsVariants[ws] ?? "neutral"}>{ws}</StatusBadge>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3 w-12">
                        {isLoading ? (
                          <div className="flex justify-center">
                            <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                              <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          </div>
                        ) : (
                          <div className="relative">
                            <button
                              ref={openMenu === row._id ? menuButtonRef : undefined}
                              onClick={(e) => {
                                if (openMenu === row._id) {
                                  setOpenMenu(null);
                                  return;
                                }
                                openActionMenu(row._id, e.currentTarget);
                              }}
                              className="rounded p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {openMenu &&
          menuPosition &&
          activeMenuRow &&
          createPortal(
            <div
              ref={menuRef}
              style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, zIndex: 60 }}
              className={`w-44 rounded-lg border border-zinc-700/30 bg-zinc-900/40 backdrop-blur-xl py-1 shadow-xl ${menuVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <MenuButton onClick={() => openEditModal(activeMenuRow)} color="blue">
                ✎ Edit
              </MenuButton>
              <div className="my-1 border-t border-zinc-700/30" />
              {playerWhitelistStatus(activeMenuRow) === "pending" && (
                <>
                  <MenuButton onClick={() => handleApprove(activeMenuRow._id)} color="emerald">
                    ✓ Approve
                  </MenuButton>
                </>
              )}
              {playerWhitelistStatus(activeMenuRow) === "whitelisted" && (
                <MenuButton onClick={() => handleUnwhitelist(activeMenuRow._id)} color="amber">
                  Remove Whitelist
                </MenuButton>
              )}
              {playerWhitelistStatus(activeMenuRow) === "none" && (
                <MenuButton onClick={() => handleWhitelist(activeMenuRow._id)} color="emerald">
                  Whitelist
                </MenuButton>
              )}
              {playerWhitelistStatus(activeMenuRow) !== "revoked" && (
                <MenuButton onClick={() => openRevokeModal(activeMenuRow)} color="red">
                  Revoke
                </MenuButton>
              )}
              {playerWhitelistStatus(activeMenuRow) === "revoked" && (
                <MenuButton onClick={() => handleWhitelist(activeMenuRow._id)} color="emerald">
                  Restore
                </MenuButton>
              )}
              <div className="my-1 border-t border-zinc-700/30" />
              <MenuButton onClick={() => openDeleteConfirmModal(activeMenuRow)} color="red">
                🗑 Delete Record
              </MenuButton>
            </div>,
            document.body,
          )}

        {/* Pagination controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
          <span>
            {pagination.total} {pagination.total === 1 ? "player" : "players"} total
            {pageSize !== "all" && pagination.pages > 1 && (
              <>
                {" "}
                &middot; Page {page} of {pagination.pages}
              </>
            )}
          </span>

          {pageSize !== "all" && pagination.pages > 1 && (
            <div className="flex items-center gap-1">
              {/* First */}
              <button onClick={() => setPage(1)} disabled={page <= 1} className="rounded px-2 py-1 transition hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400">
                ««
              </button>
              {/* Prev */}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded px-2 py-1 transition hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400">
                «
              </button>

              {/* Page numbers */}
              {(() => {
                const pages: number[] = [];
                const total = pagination.pages;
                const range = 2; // show 2 pages either side of current

                let start = Math.max(1, page - range);
                let end = Math.min(total, page + range);

                // Ensure at least 5 buttons when possible
                if (end - start < range * 2) {
                  if (start === 1) end = Math.min(total, start + range * 2);
                  else if (end === total) start = Math.max(1, end - range * 2);
                }

                for (let i = start; i <= end; i++) pages.push(i);

                return (
                  <>
                    {start > 1 && (
                      <>
                        <button onClick={() => setPage(1)} className="rounded px-2.5 py-1 text-zinc-400 transition hover:bg-white/5">
                          1
                        </button>
                        {start > 2 && <span className="px-1 text-zinc-600">…</span>}
                      </>
                    )}
                    {pages.map((p) => (
                      <button key={p} onClick={() => setPage(p)} className={`rounded px-2.5 py-1 transition ${p === page ? "bg-primary-600 text-white" : "text-zinc-400 hover:bg-white/5"}`}>
                        {p}
                      </button>
                    ))}
                    {end < total && (
                      <>
                        {end < total - 1 && <span className="px-1 text-zinc-600">…</span>}
                        <button onClick={() => setPage(total)} className="rounded px-2.5 py-1 text-zinc-400 transition hover:bg-white/5">
                          {total}
                        </button>
                      </>
                    )}
                  </>
                );
              })()}

              {/* Next */}
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="rounded px-2 py-1 transition hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400">
                »
              </button>
              {/* Last */}
              <button
                onClick={() => setPage(pagination.pages)}
                disabled={page >= pagination.pages}
                className="rounded px-2 py-1 transition hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400">
                »»
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit player modal */}
      {playerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-zinc-100">{playerModalMode === "edit" ? "Edit Player" : "Add Player"}</h3>
            <p className="mt-1 text-sm text-zinc-400">{playerModalMode === "edit" ? "Update this player's details." : "Manually add a player to the whitelist system."}</p>

            <div className="mt-5 space-y-4">
              {/* Minecraft fields */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Minecraft</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Username <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={playerForm.minecraftUsername}
                      onChange={(e) => setPlayerForm((p) => ({ ...p, minecraftUsername: e.target.value }))}
                      placeholder="Steve"
                      className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">UUID</label>
                    <input
                      type="text"
                      value={playerForm.minecraftUuid}
                      onChange={(e) => setPlayerForm((p) => ({ ...p, minecraftUuid: e.target.value }))}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Discord fields */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Discord</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Discord ID</label>
                    <input
                      type="text"
                      value={playerForm.discordId}
                      onChange={(e) => setPlayerForm((p) => ({ ...p, discordId: e.target.value }))}
                      placeholder="123456789012345678"
                      className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Discord Username</label>
                    <input
                      type="text"
                      value={playerForm.discordUsername}
                      onChange={(e) => setPlayerForm((p) => ({ ...p, discordUsername: e.target.value }))}
                      placeholder="user"
                      className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={playerForm.discordDisplayName}
                      onChange={(e) => setPlayerForm((p) => ({ ...p, discordDisplayName: e.target.value }))}
                      placeholder="Display Name"
                      className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Status</p>
                <div className="space-y-2">
                  {[
                    { value: "pending" as const, label: "Pending", desc: "Player is awaiting staff approval" },
                    { value: "whitelisted" as const, label: "Whitelisted", desc: "Player is immediately whitelisted" },
                    { value: "revoked" as const, label: "Revoked", desc: "Player is added with revoked status" },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                        playerForm.status === opt.value ? "border-primary-500 bg-primary-600/10" : "border-zinc-700 hover:border-zinc-600"
                      }`}>
                      <input
                        type="radio"
                        name="playerFormStatus"
                        checked={playerForm.status === opt.value}
                        onChange={() => setPlayerForm((p) => ({ ...p, status: opt.value }))}
                        className="mt-0.5 accent-primary-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                        <p className="text-xs text-zinc-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Revocation reason — only when revoked */}
                {playerForm.status === "revoked" && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Revocation Reason</label>
                    <input
                      type="text"
                      value={playerForm.revocationReason}
                      onChange={(e) => setPlayerForm((p) => ({ ...p, revocationReason: e.target.value }))}
                      placeholder="Reason for revocation…"
                      className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Notes</label>
                <textarea
                  value={playerForm.notes}
                  onChange={(e) => setPlayerForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Reason for adding, additional context…"
                  className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setPlayerModalOpen(false);
                  setEditingPlayerId(null);
                  setPlayerForm({ ...EMPTY_FORM });
                }}
                className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                Cancel
              </button>
              <button
                onClick={handlePlayerFormSubmit}
                disabled={playerFormLoading || !playerForm.minecraftUsername.trim()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {playerFormLoading ? (playerModalMode === "edit" ? "Saving…" : "Adding…") : playerModalMode === "edit" ? "Save Changes" : "Add Player"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk approve modal */}
      {bulkApproveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Approve Pending Requests</h3>
            <p className="mt-1 text-sm text-zinc-400">Choose how many pending players to approve. Default is all.</p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Number to approve</label>
                <input
                  type="number"
                  min={1}
                  max={pending.length}
                  value={bulkApproveCount}
                  onChange={(e) => setBulkApproveCount(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-zinc-500">Pending total: {pending.length}</p>
              </div>

              {bulkApprovedNames.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-300">Approved player list</label>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(bulkApprovedNames.join("\n"));
                          toast.success("Copied approved player list");
                        } catch {
                          toast.error("Failed to copy list");
                        }
                      }}
                      className="rounded-md border border-zinc-700/30 px-2 py-1 text-xs text-zinc-300 transition hover:bg-white/5">
                      Copy
                    </button>
                  </div>
                  <textarea readOnly rows={6} value={bulkApprovedNames.join("\n")} className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none" />
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                onClick={() => {
                  setBulkApproveOpen(false);
                  setBulkApprovedIds([]);
                  setBulkApprovedNames([]);
                }}
                className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                Close
              </button>
              {bulkApprovedIds.length > 0 && (
                <button
                  onClick={handleBulkRevert}
                  disabled={bulkRevertLoading}
                  className="rounded-lg border border-red-600/40 bg-red-600/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-600/20 disabled:opacity-50">
                  {bulkRevertLoading ? "Reverting…" : "Revert"}
                </button>
              )}
              <button
                onClick={handleBulkApprove}
                disabled={bulkApproveLoading || pending.length === 0}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50">
                {bulkApproveLoading ? "Approving…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import whitelist modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Import Whitelist</h3>
            <p className="mt-1 text-sm text-zinc-400">Import Minecraft whitelist JSON, legacy Heimdall exports, or current system exports.</p>

            {/* Mode toggle */}
            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-400 mb-2">Import Method</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setImportMode("file")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    importMode === "file" ? "bg-primary-600/20 text-primary-400 border border-primary-500" : "bg-white/5 text-zinc-400 border border-zinc-700/30 hover:text-zinc-200"
                  }`}>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Upload File
                </button>
                <button
                  onClick={() => setImportMode("paste")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    importMode === "paste" ? "bg-primary-600/20 text-primary-400 border border-primary-500" : "bg-white/5 text-zinc-400 border border-zinc-700/30 hover:text-zinc-200"
                  }`}>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Paste JSON
                </button>
              </div>
            </div>

            {/* File upload mode */}
            {importMode === "file" && (
              <div className="mt-4">
                <p className="text-xs font-medium text-zinc-400 mb-2">Whitelist File</p>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-700/30 bg-white/5 px-4 py-3 transition hover:border-zinc-600">
                  <span className="text-sm text-zinc-400">Choose file</span>
                  <span className="text-sm text-zinc-500">{importFile ? importFile.name : "No file chosen"}</span>
                </div>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              </div>
            )}

            {/* Paste JSON mode */}
            {importMode === "paste" && (
              <div className="mt-4">
                <p className="text-xs font-medium text-zinc-400 mb-2">Whitelist JSON</p>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  rows={6}
                  placeholder='[{"name": "PlayerName", "uuid": "player-uuid-here"}, ...] or Heimdall export array'
                  className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500 font-mono"
                />
              </div>
            )}

            {/* Overwrite toggle */}
            <label className="mt-4 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={importOverwrite}
                onChange={(e) => setImportOverwrite(e.target.checked)}
                disabled={importLoading}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
              />
              <span className="text-sm text-zinc-300">Overwrite existing records</span>
              <span className="text-xs text-zinc-500">(update duplicates instead of skipping)</span>
            </label>

            {/* Progress bar */}
            {importProgress && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>
                    Processing {importProgress.processed.toLocaleString()} / {importProgress.total.toLocaleString()}
                  </span>
                  <span>{Math.round((importProgress.processed / importProgress.total) * 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-primary-500 transition-all duration-300 ease-out" style={{ width: `${(importProgress.processed / importProgress.total) * 100}%` }} />
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-400">{importProgress.imported} imported</span>
                  {importProgress.overwritten > 0 && <span className="text-blue-400">{importProgress.overwritten} overwritten</span>}
                  <span className="text-zinc-500">{importProgress.skipped} skipped</span>
                  {importProgress.errors > 0 && <span className="text-red-400">{importProgress.errors} errors</span>}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (!importLoading) setImportOpen(false);
                }}
                disabled={importLoading}
                className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importLoading || (importMode === "file" ? !importFile : !importJson.trim())}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {importLoading ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reason modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Revoke — {reasonModal.username}</h3>
            <p className="mt-1 text-sm text-zinc-400">Provide a reason for revoking this player's access.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason…"
              className="mt-4 w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setReasonModal(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                Cancel
              </button>
              <button
                onClick={submitReason}
                disabled={!reason.trim() || actionLoading === reasonModal.playerId}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading === reasonModal.playerId ? "Processing…" : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-red-700/40 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-red-400">🗑 Delete Record — {deleteConfirmModal.username}</h3>
            <p className="mt-2 text-sm text-zinc-400">
              This will <span className="font-semibold text-red-400">permanently delete</span> the player record for <span className="font-semibold text-zinc-200">{deleteConfirmModal.username}</span>.
              This action cannot be undone.
            </p>
            <p className="mt-2 text-sm text-zinc-500">The player will need to re-link their account from scratch if they want to rejoin.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setDeleteConfirmModal(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                Cancel
              </button>
              <button
                onClick={submitDeletePermanent}
                disabled={actionLoading === deleteConfirmModal.playerId}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading === deleteConfirmModal.playerId ? "Deleting…" : "Delete Permanently"}
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

function MenuButton({ onClick, color, children }: { onClick: () => void; color: "emerald" | "red" | "amber" | "blue"; children: React.ReactNode }) {
  const colorClasses = {
    emerald: "hover:bg-emerald-500/10 text-emerald-400",
    red: "hover:bg-red-500/10 text-red-400",
    amber: "hover:bg-amber-500/10 text-amber-400",
    blue: "hover:bg-blue-500/10 text-blue-400",
  };

  return (
    <button onClick={onClick} className={`w-full px-4 py-2 text-left text-sm transition ${colorClasses[color]}`}>
      {children}
    </button>
  );
}
