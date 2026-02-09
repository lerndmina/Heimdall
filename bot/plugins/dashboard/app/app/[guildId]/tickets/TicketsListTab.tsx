/**
 * TicketsListTab — read-only, paginated ticket browser with expandable detail view.
 * Staff can claim/unclaim/close tickets from the dashboard.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { useSession } from "next-auth/react";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface Ticket {
  _id: string;
  id: string;
  guildId: string;
  ticketNumber: number;
  userId: string;
  userDisplayName: string;
  categoryId: string;
  categoryName: string;
  status: "open" | "claimed" | "closed" | "archived";
  claimedBy?: string;
  claimedAt?: string;
  closedBy?: string;
  closedAt?: string;
  openedAt: string;
  lastActivityAt: string;
  questionResponses?: { questionLabel: string; answer: string }[];
}

interface Stats {
  total: number;
  open: number;
  claimed: number;
  closed: number;
  archived: number;
}

interface TicketListResponse {
  tickets: Ticket[];
  pagination: { total: number; limit: number; offset: number } | Ticket[];
}

// ── Constants ────────────────────────────────────────────

const PAGE_SIZE = 20;
const STATUS_FILTERS = ["all", "open", "claimed", "closed", "archived"] as const;

// ── Component ────────────────────────────────────────────

export default function TicketsListTab({ guildId }: { guildId: string }) {
  const canManage = useCanManage("tickets.manage_tickets");
  const { data: session } = useSession();

  // Data
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  // Detail
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Actions
  const [actionLoading, setActionLoading] = useState(false);

  // ── Fetch ──
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const [listRes, statsRes] = await Promise.all([fetchApi<any>(guildId, `tickets?${params.toString()}`, { skipCache: true }), fetchApi<Stats>(guildId, "tickets/stats", { skipCache: true })]);

      if (listRes.success && listRes.data) {
        // API may return { tickets, pagination } or just array
        if (Array.isArray(listRes.data)) {
          setTickets(listRes.data);
          setTotal(listRes.data.length);
        } else {
          setTickets(listRes.data.tickets ?? listRes.data);
          setTotal(listRes.data.pagination?.total ?? listRes.data.length ?? 0);
        }
      } else {
        setError(listRes.error?.message ?? "Failed to load tickets");
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId, statusFilter, page]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useRealtimeEvent("tickets:updated", () => {
    fetchTickets();
  });

  useEffect(() => {
    setPage(0);
  }, [statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Detail ──
  const openDetail = async (ticket: Ticket) => {
    setDetailTicket(ticket);
    setLoadingDetail(true);
    try {
      const res = await fetchApi<Ticket>(guildId, `tickets/${ticket.id}`, { skipCache: true });
      if (res.success && res.data) {
        setDetailTicket(res.data);
      }
    } catch {
      // show what we have
    } finally {
      setLoadingDetail(false);
    }
  };

  // ── Actions ──
  const handleClaim = async () => {
    if (!detailTicket || !session?.user?.id) return;
    setActionLoading(true);
    try {
      const res = await fetchApi(guildId, `tickets/${detailTicket.id}/claim`, {
        method: "PATCH",
        body: JSON.stringify({ staffId: session.user.id }),
      });
      if (res.success) {
        toast.success("Ticket claimed");
        setDetailTicket(null);
        fetchTickets();
      } else {
        toast.error(res.error?.message ?? "Failed to claim");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnclaim = async () => {
    if (!detailTicket) return;
    setActionLoading(true);
    try {
      const res = await fetchApi(guildId, `tickets/${detailTicket.id}/unclaim`, { method: "PATCH" });
      if (res.success) {
        toast.success("Ticket unclaimed");
        setDetailTicket(null);
        fetchTickets();
      } else {
        toast.error(res.error?.message ?? "Failed to unclaim");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    if (!detailTicket || !session?.user?.id) return;
    setActionLoading(true);
    try {
      const res = await fetchApi(guildId, `tickets/${detailTicket.id}/close`, {
        method: "PATCH",
        body: JSON.stringify({ closedBy: session.user.id }),
      });
      if (res.success) {
        toast.success("Ticket closed");
        setDetailTicket(null);
        fetchTickets();
      } else {
        toast.error(res.error?.message ?? "Failed to close");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Helpers ──
  function getStatusVariant(status: string): "success" | "warning" | "error" | "neutral" {
    switch (status) {
      case "open":
        return "success";
      case "claimed":
        return "warning";
      case "closed":
        return "error";
      case "archived":
        return "neutral";
      default:
        return "neutral";
    }
  }

  // ====== Loading ======
  if (loading && tickets.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading tickets…" />
      </div>
    );
  }

  if (error && tickets.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchTickets} className="mt-3 rounded-lg bg-white/5 backdrop-blur-sm px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10">
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
        <div className="grid gap-3 sm:grid-cols-5">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Open" value={stats.open} color="text-emerald-400" />
          <StatCard label="Claimed" value={stats.claimed} color="text-amber-400" />
          <StatCard label="Closed" value={stats.closed} color="text-red-400" />
          <StatCard label="Archived" value={stats.archived} color="text-zinc-500" />
        </div>
      )}

      {/* Filters */}
      <div className="flex rounded-lg border border-zinc-700/30 overflow-hidden w-fit">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium capitalize transition ${statusFilter === s ? "bg-primary-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <CardTitle>No Tickets</CardTitle>
          <CardDescription className="mt-2">{statusFilter !== "all" ? `No ${statusFilter} tickets found.` : "No tickets have been created yet."}</CardDescription>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700/30 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                    <th className="pb-3 pr-4">#</th>
                    <th className="pb-3 pr-4">User</th>
                    <th className="pb-3 pr-4">Category</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Opened</th>
                    <th className="pb-3 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700/30">
                  {tickets.map((t) => (
                    <tr key={t.id} className="group cursor-pointer hover:bg-white/5" onClick={() => openDetail(t)}>
                      <td className="py-3 pr-4 font-mono text-zinc-400">{t.ticketNumber}</td>
                      <td className="py-3 pr-4 text-zinc-200">{t.userDisplayName}</td>
                      <td className="py-3 pr-4 text-zinc-400">{t.categoryName}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge variant={getStatusVariant(t.status)}>{t.status}</StatusBadge>
                      </td>
                      <td className="py-3 pr-4 text-zinc-500">{new Date(t.openedAt).toLocaleDateString()}</td>
                      <td className="py-3 text-right">
                        <svg className="inline h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {loading && tickets.length > 0 && (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-zinc-700/30 pt-4">
                <p className="text-xs text-zinc-500">
                  {total} ticket{total !== 1 ? "s" : ""}
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
          </CardContent>
        </Card>
      )}

      {/* Detail modal */}
      <Modal
        open={detailTicket !== null}
        onClose={() => setDetailTicket(null)}
        title={detailTicket ? `Ticket #${detailTicket.ticketNumber} — ${detailTicket.userDisplayName}` : "Ticket"}
        footer={
          detailTicket && canManage && (detailTicket.status === "open" || detailTicket.status === "claimed") ? (
            <>
              <button onClick={() => setDetailTicket(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                Close Panel
              </button>
              {detailTicket.status === "open" && (
                <button onClick={handleClaim} disabled={actionLoading} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50">
                  {actionLoading ? "Claiming…" : "Claim"}
                </button>
              )}
              {detailTicket.status === "claimed" && (
                <button
                  onClick={handleUnclaim}
                  disabled={actionLoading}
                  className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50">
                  Unclaim
                </button>
              )}
              {(detailTicket.status === "open" || detailTicket.status === "claimed") && (
                <button onClick={handleClose} disabled={actionLoading} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
                  {actionLoading ? "Closing…" : "Close Ticket"}
                </button>
              )}
            </>
          ) : undefined
        }>
        {detailTicket && (
          <div className="space-y-4">
            {loadingDetail && (
              <div className="flex justify-center py-4">
                <Spinner label="Loading details…" />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <FieldDisplay label="Status" value={detailTicket.status} />
              <FieldDisplay label="Category" value={detailTicket.categoryName} />
              <FieldDisplay label="User" value={detailTicket.userDisplayName} />
              <FieldDisplay label="Opened" value={new Date(detailTicket.openedAt).toLocaleString()} />
              {detailTicket.claimedBy && <FieldDisplay label="Claimed By" value={detailTicket.claimedBy} />}
              {detailTicket.claimedAt && <FieldDisplay label="Claimed At" value={new Date(detailTicket.claimedAt).toLocaleString()} />}
              {detailTicket.closedBy && <FieldDisplay label="Closed By" value={detailTicket.closedBy} />}
              {detailTicket.closedAt && <FieldDisplay label="Closed At" value={new Date(detailTicket.closedAt).toLocaleString()} />}
              <FieldDisplay label="Last Activity" value={new Date(detailTicket.lastActivityAt).toLocaleString()} />
            </div>

            {/* Question responses */}
            {detailTicket.questionResponses && detailTicket.questionResponses.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">Intake Responses</p>
                <div className="space-y-2 rounded-lg border border-zinc-700/30 bg-white/5 p-3">
                  {detailTicket.questionResponses.map((qr, i) => (
                    <div key={i}>
                      <p className="text-xs font-medium text-zinc-400">{qr.questionLabel}</p>
                      <p className="text-sm text-zinc-200">{qr.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function FieldDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-200 capitalize">{value}</p>
    </div>
  );
}

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
