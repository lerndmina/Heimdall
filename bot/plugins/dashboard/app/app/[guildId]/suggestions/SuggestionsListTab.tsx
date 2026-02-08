/**
 * SuggestionsListTab — searchable, paginated list of suggestions with status badges
 * and the ability to approve/deny from the dashboard.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface Suggestion {
  _id: string;
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  mode: "embed" | "forum";
  suggestion: string;
  reason: string;
  title: string;
  categoryId?: string;
  status: "pending" | "approved" | "denied";
  messageLink: string;
  managedBy?: string;
  voteCounts: { up: number; down: number };
  netVotes: number;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  denied: number;
}

interface SuggestionListResponse {
  suggestions: Suggestion[];
  total: number;
  limit: number;
  offset: number;
}

// ── Constants ────────────────────────────────────────────

const PAGE_SIZE = 20;
const STATUS_FILTERS = ["all", "pending", "approved", "denied"] as const;
const SORT_OPTIONS = [
  { value: "createdAt", label: "Newest" },
  { value: "votes", label: "Most Votes" },
] as const;

// ── Component ────────────────────────────────────────────

export default function SuggestionsListTab({ guildId }: { guildId: string }) {
  const { permissions, isOwner } = usePermissions();
  const canManage = isOwner || permissions["suggestions.manage_suggestions"] === true;

  // Data
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("createdAt");
  const [page, setPage] = useState(0);

  // Manage modal
  const [manageTarget, setManageTarget] = useState<Suggestion | null>(null);
  const [manageAction, setManageAction] = useState<"approved" | "denied">("approved");
  const [managing, setManaging] = useState(false);

  // ── Fetch ──
  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sort", sort);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const [listRes, statsRes] = await Promise.all([
        fetchApi<SuggestionListResponse>(guildId, `suggestions?${params.toString()}`, { skipCache: true }),
        fetchApi<Stats>(guildId, "suggestions/stats", { skipCache: true }),
      ]);

      if (listRes.success && listRes.data) {
        setSuggestions(listRes.data.suggestions);
        setTotal(listRes.data.total);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      if (!listRes.success) {
        setError(listRes.error?.message ?? "Failed to load suggestions");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId, statusFilter, sort, page]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Manage (approve/deny) ──
  const handleManage = async () => {
    if (!manageTarget) return;
    setManaging(true);
    try {
      const res = await fetchApi(guildId, `suggestions/${manageTarget.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: manageAction,
          managedBy: "dashboard",
        }),
      });
      if (res.success) {
        toast.success(`Suggestion ${manageAction}`);
        setManageTarget(null);
        fetchSuggestions();
      } else {
        toast.error(res.error?.message ?? `Failed to ${manageAction} suggestion`);
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setManaging(false);
    }
  };

  // ── Status badge helper ──
  function getStatusVariant(status: string): "success" | "warning" | "error" | "neutral" {
    switch (status) {
      case "approved":
        return "success";
      case "pending":
        return "warning";
      case "denied":
        return "error";
      default:
        return "neutral";
    }
  }

  // ====== Loading ======
  if (loading && suggestions.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading suggestions…" />
      </div>
    );
  }

  if (error && suggestions.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchSuggestions} className="mt-3 rounded-lg bg-white/5 backdrop-blur-sm px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10">
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
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Pending" value={stats.pending} color="text-amber-400" />
          <StatCard label="Approved" value={stats.approved} color="text-emerald-400" />
          <StatCard label="Denied" value={stats.denied} color="text-red-400" />
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-zinc-700/30 overflow-hidden">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition ${statusFilter === s ? "bg-primary-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>
              {s}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-3 py-1.5 text-xs text-zinc-200 outline-none transition focus:border-primary-500">
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Suggestion list */}
      {suggestions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <CardTitle>No Suggestions</CardTitle>
          <CardDescription className="mt-2 max-w-md">{statusFilter !== "all" ? `No ${statusFilter} suggestions found.` : "No suggestions have been submitted yet."}</CardDescription>
        </Card>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge variant={getStatusVariant(s.status)}>{s.status}</StatusBadge>
                    <span className="text-xs font-mono text-zinc-500">#{s.id}</span>
                    {s.mode === "forum" && <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">Forum</span>}
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-zinc-200">{s.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400 line-clamp-2">{s.suggestion}</p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                    <span>
                      Votes: <span className="text-emerald-400">+{s.voteCounts.up}</span> / <span className="text-red-400">-{s.voteCounts.down}</span> (net:{" "}
                      {s.netVotes >= 0 ? `+${s.netVotes}` : s.netVotes})
                    </span>
                    <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                    {s.messageLink && (
                      <a href={s.messageLink} target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300">
                        View in Discord
                      </a>
                    )}
                  </div>
                </div>
                {canManage && s.status === "pending" && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setManageTarget(s);
                        setManageAction("approved");
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/10"
                      title="Approve">
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setManageTarget(s);
                        setManageAction("denied");
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                      title="Deny">
                      Deny
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}

          {loading && (
            <div className="flex justify-center py-3">
              <Spinner />
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-zinc-500">
                {total} suggestion{total !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-zinc-700/30 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">
                  Previous
                </button>
                <span className="text-xs text-zinc-500">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg border border-zinc-700/30 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approve/Deny modal */}
      <Modal
        open={manageTarget !== null}
        onClose={() => setManageTarget(null)}
        title={`${manageAction === "approved" ? "Approve" : "Deny"} Suggestion`}
        footer={
          <>
            <button onClick={() => setManageTarget(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleManage}
              disabled={managing}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
                manageAction === "approved" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"
              }`}>
              {managing && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {managing ? (manageAction === "approved" ? "Approving…" : "Denying…") : manageAction === "approved" ? "Approve" : "Deny"}
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Are you sure you want to {manageAction === "approved" ? "approve" : "deny"} this suggestion?</p>
          {manageTarget && (
            <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-3">
              <p className="text-sm font-medium text-zinc-200">{manageTarget.title}</p>
              <p className="mt-1 text-xs text-zinc-400 line-clamp-3">{manageTarget.suggestion}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${color ?? "text-zinc-100"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
