/**
 * RemindersPage — auto-scoped to the logged-in user's Discord ID.
 *
 * Because reminders are per-user, we use `session.user.id` for every API call.
 * No user picker — you only see/manage your own reminders.
 *
 * API:
 *   GET    /reminders?userId&includeTriggered&sort&limit&offset → { reminders[], total }
 *   POST   /reminders      { userId, channelId, message, triggerAt }
 *   PUT    /reminders/:id  { userId, message?, triggerAt? }
 *   DELETE /reminders/:id?userId=
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import Modal from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import DateTimePicker from "@/components/ui/DateTimePicker";
import { useSession } from "next-auth/react";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface Reminder {
  _id: string;
  userId: string;
  guildId: string;
  channelId: string;
  message: string;
  triggerAt: string;
  triggered: boolean;
  contextType?: "ticket" | "modmail" | null;
  contextData?: {
    ticketNumber?: number;
    categoryName?: string;
    userName?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface ReminderListResponse {
  reminders: Reminder[];
  total: number;
  limit: number;
  offset: number;
}

// ── Constants ────────────────────────────────────────────

const PAGE_SIZE = 15;

// ── Component ────────────────────────────────────────────

export default function RemindersPage({ guildId }: { guildId: string }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [includeTriggered, setIncludeTriggered] = useState(false);
  const [page, setPage] = useState(0);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftTriggerAt, setDraftTriggerAt] = useState("");
  const [draftChannelId, setDraftChannelId] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──
  const fetchReminders = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("userId", userId);
      if (includeTriggered) params.set("includeTriggered", "true");
      params.set("sort", "triggerAt");
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetchApi<ReminderListResponse>(guildId, `reminders?${params.toString()}`, { skipCache: true });
      if (res.success && res.data) {
        setReminders(res.data.reminders);
        setTotal(res.data.total);
      } else {
        setError(res.error?.message ?? "Failed to load reminders");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId, userId, includeTriggered, page]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  useRealtimeEvent("reminders:updated", () => {
    fetchReminders();
  });

  useEffect(() => {
    setPage(0);
  }, [includeTriggered]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Helpers ──
  function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const target = new Date(dateStr).getTime();
    const diff = target - now;
    const absDiff = Math.abs(diff);

    if (absDiff < 60_000) return diff >= 0 ? "in < 1m" : "< 1m ago";
    if (absDiff < 3_600_000) {
      const mins = Math.round(absDiff / 60_000);
      return diff >= 0 ? `in ${mins}m` : `${mins}m ago`;
    }
    if (absDiff < 86_400_000) {
      const hrs = Math.round(absDiff / 3_600_000);
      return diff >= 0 ? `in ${hrs}h` : `${hrs}h ago`;
    }
    const days = Math.round(absDiff / 86_400_000);
    return diff >= 0 ? `in ${days}d` : `${days}d ago`;
  }

  // ── Create / Edit ──
  const openCreateModal = () => {
    setEditReminder(null);
    setDraftMessage("");
    setDraftTriggerAt("");
    setDraftChannelId("");
    setModalOpen(true);
  };

  const openEditModal = (r: Reminder) => {
    setEditReminder(r);
    setDraftMessage(r.message);
    setDraftTriggerAt(r.triggerAt);
    setDraftChannelId(r.channelId);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!draftMessage.trim()) {
      toast.error("Message is required");
      return;
    }
    if (!draftTriggerAt) {
      toast.error("Trigger time is required");
      return;
    }

    setModalSaving(true);
    try {
      if (editReminder) {
        const res = await fetchApi<Reminder>(guildId, `reminders/${editReminder._id}`, {
          method: "PUT",
          body: JSON.stringify({
            userId,
            message: draftMessage,
            triggerAt: draftTriggerAt,
          }),
        });
        if (res.success) {
          toast.success("Reminder updated");
          setModalOpen(false);
          fetchReminders();
        } else {
          toast.error(res.error?.message ?? "Failed to update reminder");
        }
      } else {
        if (!draftChannelId) {
          toast.error("Please select a channel for the reminder");
          setModalSaving(false);
          return;
        }
        const res = await fetchApi<Reminder>(guildId, "reminders", {
          method: "POST",
          body: JSON.stringify({
            userId,
            channelId: draftChannelId,
            message: draftMessage,
            triggerAt: draftTriggerAt,
          }),
        });
        if (res.success) {
          toast.success("Reminder created");
          setModalOpen(false);
          fetchReminders();
        } else {
          toast.error(res.error?.message ?? "Failed to create reminder");
        }
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setModalSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget || !userId) return;
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, `reminders/${deleteTarget._id}?userId=${userId}`, {
        method: "DELETE",
      });
      if (res.success) {
        toast.success("Reminder deleted");
        setDeleteTarget(null);
        fetchReminders();
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  // ── Loading state ──
  if (!userId) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading session…" />
      </div>
    );
  }

  if (loading && reminders.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading reminders…" />
      </div>
    );
  }

  if (error && reminders.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchReminders} className="mt-3 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700">
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Toggle label="Show triggered" checked={includeTriggered} onChange={setIncludeTriggered} />
        </div>
        <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Reminder
        </button>
      </div>

      {/* Reminder list */}
      {reminders.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-zinc-800 p-4">
            <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <CardTitle>No Reminders</CardTitle>
          <CardDescription className="mt-2 max-w-md">
            {includeTriggered ? "You have no reminders (past or pending)." : "You have no pending reminders. Create one to get notified at a specific time."}
          </CardDescription>
        </Card>
      ) : (
        <div className="space-y-3">
          {reminders.map((r) => (
            <Card key={r._id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.triggered ? (
                      <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">Triggered</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-400">{formatRelativeTime(r.triggerAt)}</span>
                    )}
                    {r.contextType && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                        {r.contextType === "ticket" ? `Ticket #${r.contextData?.ticketNumber ?? ""}` : "Modmail"}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-zinc-200">{r.message}</p>
                  <p className="mt-1 text-xs text-zinc-500">{new Date(r.triggerAt).toLocaleString()}</p>
                </div>
                {!r.triggered && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditModal(r)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200" title="Edit">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400" title="Delete">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}

          {/* Loading overlay for refetch */}
          {loading && (
            <div className="flex justify-center py-3">
              <Spinner />
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-zinc-500">
                {total} reminder{total !== 1 ? "s" : ""} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed">
                  Previous
                </button>
                <span className="text-xs text-zinc-500">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editReminder ? "Edit Reminder" : "New Reminder"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={modalSaving || !draftMessage.trim() || !draftTriggerAt}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {modalSaving && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {editReminder ? "Update" : "Create"}
            </button>
          </>
        }>
        <div className="space-y-4">
          <Textarea label="Message" description="What should the reminder say?" value={draftMessage} onChange={setDraftMessage} placeholder="Don't forget to…" maxLength={1000} rows={4} />

          <DateTimePicker label="Trigger At" description="When should this reminder fire?" value={draftTriggerAt} onChange={setDraftTriggerAt} min={new Date().toISOString()} />

          {!editReminder && (
            <ChannelCombobox
              guildId={guildId}
              value={draftChannelId}
              onChange={setDraftChannelId}
              channelType="text"
              excludeForums
              label="Channel"
              description="Which channel should the reminder be sent in?"
            />
          )}
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Reminder"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800">
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
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">Are you sure you want to cancel this reminder? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
