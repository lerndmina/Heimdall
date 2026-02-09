/**
 * ModmailConversationsTab — read-only, paginated conversation browser with
 * expandable detail view.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import TextInput from "@/components/ui/TextInput";
import Modal from "@/components/ui/Modal";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";

// ── Types ────────────────────────────────────────────────

interface Conversation {
  id: string;
  ticketNumber: number;
  userId: string;
  userDisplayName: string;
  userAvatarUrl?: string;
  status: "open" | "resolved" | "closed";
  categoryName?: string;
  claimedBy?: string;
  messages?: ConvMessage[];
  metrics?: {
    totalMessages: number;
    userMessages: number;
    staffMessages: number;
    firstStaffResponseTime?: number;
  };
  formResponses?: { fieldLabel: string; value: string }[];
  createdAt: string;
  closedAt?: string;
  lastUserActivityAt?: string;
}

interface ConvMessage {
  id: string;
  senderId: string;
  senderTag: string;
  senderType: "user" | "staff" | "system";
  content: string;
  isStaffOnly: boolean;
  sentAt: string;
}

interface ConversationListResponse {
  conversations: Conversation[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface Stats {
  total: number;
  open: number;
  resolved: number;
  closed: number;
  averageResponseTime?: number;
}

// ── Constants ────────────────────────────────────────────

const STATUS_FILTERS = ["all", "open", "resolved", "closed"] as const;

// ── Component ────────────────────────────────────────────

export default function ModmailConversationsTab({ guildId }: { guildId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalItems: 0 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Detail view
  const [detailConv, setDetailConv] = useState<Conversation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Fetch list ──
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const [listRes, statsRes] = await Promise.all([
        fetchApi<ConversationListResponse>(guildId, `modmail/conversations?${params.toString()}`, { skipCache: true }),
        fetchApi<Stats>(guildId, "modmail/stats", { skipCache: true }),
      ]);

      if (listRes.success && listRes.data) {
        setConversations(listRes.data.conversations);
        setPagination(listRes.data.pagination);
      } else {
        setError(listRes.error?.message ?? "Failed to load conversations");
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId, statusFilter, search, page]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useRealtimeEvent("dashboard:data_changed", () => {
    fetchConversations();
  });

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  // ── Fetch detail ──
  const openDetail = async (conv: Conversation) => {
    setLoadingDetail(true);
    setDetailConv(conv);
    try {
      const res = await fetchApi<Conversation>(guildId, `modmail/conversations/${conv.id}`, { skipCache: true });
      if (res.success && res.data) {
        setDetailConv(res.data);
      }
    } catch {
      // Just show what we have
    } finally {
      setLoadingDetail(false);
    }
  };

  // ── Helpers ──
  function getStatusVariant(status: string): "success" | "warning" | "error" | "neutral" {
    switch (status) {
      case "open":
        return "success";
      case "resolved":
        return "warning";
      case "closed":
        return "neutral";
      default:
        return "neutral";
    }
  }

  function formatResponseTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const hrs = Math.floor(seconds / 3600);
    return `${hrs}h`;
  }

  // ====== Loading ======
  if (loading && conversations.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading conversations…" />
      </div>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchConversations} className="mt-3 rounded-lg bg-white/5 backdrop-blur-sm px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10">
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
          <StatCard label="Open" value={stats.open} color="text-emerald-400" />
          <StatCard label="Resolved" value={stats.resolved} color="text-amber-400" />
          <StatCard label="Closed" value={stats.closed} color="text-zinc-400" />
        </div>
      )}

      {/* Filters */}
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
        <TextInput label="Search" placeholder="Search by user…" value={search} onChange={setSearch} />
      </div>

      {/* Conversation list */}
      {conversations.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <CardTitle>No Conversations</CardTitle>
          <CardDescription className="mt-2">{search ? `No results for "${search}"` : "No modmail conversations found."}</CardDescription>
        </Card>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <div key={conv.id} className="cursor-pointer" onClick={() => openDetail(conv)}>
              <Card className="transition hover:border-zinc-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {conv.userAvatarUrl ? <img src={conv.userAvatarUrl} alt="" className="h-8 w-8 rounded-full" /> : <div className="h-8 w-8 rounded-full bg-zinc-700" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-200">{conv.userDisplayName}</p>
                        <span className="text-xs font-mono text-zinc-500">#{conv.ticketNumber}</span>
                        <StatusBadge variant={getStatusVariant(conv.status)}>{conv.status}</StatusBadge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                        {conv.categoryName && <span>{conv.categoryName}</span>}
                        {conv.claimedBy && <span>· Claimed by {conv.claimedBy}</span>}
                        <span>· {new Date(conv.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <svg className="h-4 w-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Card>
            </div>
          ))}

          {loading && (
            <div className="flex justify-center py-3">
              <Spinner />
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-zinc-500">
                {pagination.totalItems} conversation{pagination.totalItems !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.currentPage <= 1}
                  className="rounded-lg border border-zinc-700/30 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">
                  Previous
                </button>
                <span className="text-xs text-zinc-500">
                  {pagination.currentPage} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={pagination.currentPage >= pagination.totalPages}
                  className="rounded-lg border border-zinc-700/30 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      <Modal open={detailConv !== null} onClose={() => setDetailConv(null)} title={detailConv ? `Modmail #${detailConv.ticketNumber} — ${detailConv.userDisplayName}` : "Conversation"}>
        {detailConv && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Meta */}
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Status</p>
                <StatusBadge variant={getStatusVariant(detailConv.status)}>{detailConv.status}</StatusBadge>
              </div>
              {detailConv.categoryName && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Category</p>
                  <p className="text-zinc-200">{detailConv.categoryName}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Created</p>
                <p className="text-zinc-200">{new Date(detailConv.createdAt).toLocaleString()}</p>
              </div>
              {detailConv.closedAt && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Closed</p>
                  <p className="text-zinc-200">{new Date(detailConv.closedAt).toLocaleString()}</p>
                </div>
              )}
              {detailConv.metrics && (
                <>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Messages</p>
                    <p className="text-zinc-200">
                      {detailConv.metrics.totalMessages} (User: {detailConv.metrics.userMessages}, Staff: {detailConv.metrics.staffMessages})
                    </p>
                  </div>
                  {detailConv.metrics.firstStaffResponseTime != null && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">First Response</p>
                      <p className="text-zinc-200">{formatResponseTime(detailConv.metrics.firstStaffResponseTime)}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Form responses */}
            {detailConv.formResponses && detailConv.formResponses.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">Form Responses</p>
                <div className="space-y-2 rounded-lg border border-zinc-700/30 bg-white/5 p-3">
                  {detailConv.formResponses.map((fr, i) => (
                    <div key={i}>
                      <p className="text-xs font-medium text-zinc-400">{fr.fieldLabel}</p>
                      <p className="text-sm text-zinc-200">{fr.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {loadingDetail ? (
              <div className="flex justify-center py-4">
                <Spinner label="Loading messages…" />
              </div>
            ) : detailConv.messages && detailConv.messages.length > 0 ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">Conversation</p>
                <div className="space-y-2">
                  {detailConv.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg p-3 ${
                        msg.senderType === "staff"
                          ? msg.isStaffOnly
                            ? "bg-amber-500/5 border border-amber-500/20"
                            : "bg-primary-500/5 border border-primary-500/20"
                          : msg.senderType === "system"
                            ? "bg-white/5 border border-zinc-700/30"
                            : "bg-white/5 border border-zinc-700/30"
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${msg.senderType === "staff" ? "text-primary-400" : msg.senderType === "system" ? "text-zinc-500" : "text-zinc-300"}`}>
                          {msg.senderTag}
                        </span>
                        {msg.isStaffOnly && <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Staff Only</span>}
                        <span className="text-[10px] text-zinc-600">{new Date(msg.sentAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-zinc-500 py-4">No messages available</p>
            )}
          </div>
        )}
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
