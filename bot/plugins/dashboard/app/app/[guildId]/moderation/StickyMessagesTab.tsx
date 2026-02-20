"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Toggle from "@/components/ui/Toggle";
import Textarea from "@/components/ui/Textarea";
import TextInput from "@/components/ui/TextInput";
import Modal from "@/components/ui/Modal";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import EmbedEditor, { type EmbedData } from "@/components/ui/EmbedEditor";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface StickyMessage {
  guildId: string;
  channelId: string;
  channelName: string;
  content: string;
  color: number;
  useEmbed: boolean;
  embedTitle?: string;
  embedImage?: string;
  embedThumbnail?: string;
  embedFooter?: string;
  currentMessageId?: string;
  moderatorId: string;
  enabled: boolean;
  detectionBehavior: "instant" | "delay";
  detectionDelay: number;
  conversationDuration: number;
  conversationDeleteBehavior: "immediate" | "after_conversation";
  sendOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Color Helpers ────────────────────────────────────────

function getColorDot(color: number): string {
  if (color === 0) return "transparent";
  return "#" + color.toString(16).padStart(6, "0");
}

// ── Component ────────────────────────────────────────────

export default function StickyMessagesTab({ guildId, canManage }: { guildId: string; canManage: boolean }) {
  // State
  const [stickies, setStickies] = useState<StickyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StickyMessage | null>(null);
  const [draftChannel, setDraftChannel] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftUseEmbed, setDraftUseEmbed] = useState(false);
  const [draftEmbed, setDraftEmbed] = useState<EmbedData>({});
  const [draftDetectionBehavior, setDraftDetectionBehavior] = useState<"instant" | "delay">("instant");
  const [draftDetectionDelay, setDraftDetectionDelay] = useState(5);
  const [draftConversationDuration, setDraftConversationDuration] = useState(10);
  const [draftConversationDeleteBehavior, setDraftConversationDeleteBehavior] = useState<"immediate" | "after_conversation">("after_conversation");
  const [draftSendOrder, setDraftSendOrder] = useState(1);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<StickyMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──
  const fetchStickies = useCallback(async () => {
    try {
      const res = await fetchApi<StickyMessage[]>(guildId, "moderation/stickies", { skipCache: true });
      if (res.success && res.data) {
        setStickies(res.data);
        setError(null);
      } else {
        setError(res.error?.message ?? "Failed to load sticky messages");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchStickies();
  }, [fetchStickies]);

  useRealtimeEvent("moderation:updated", () => {
    fetchStickies();
  });

  // ── Modal handlers ──
  const openCreateModal = () => {
    setEditing(null);
    setDraftChannel("");
    setDraftContent("");
    setDraftUseEmbed(false);
    setDraftEmbed({});
    setDraftDetectionBehavior("instant");
    setDraftDetectionDelay(5);
    setDraftConversationDuration(10);
    setDraftConversationDeleteBehavior("after_conversation");
    setDraftSendOrder(1);
    setModalOpen(true);
  };

  const openEditModal = (sticky: StickyMessage) => {
    setEditing(sticky);
    setDraftChannel(sticky.channelId);
    setDraftContent(sticky.content);
    // Migrate legacy: if color > 0 but useEmbed isn't set, treat as embed mode
    const isEmbed = sticky.useEmbed || sticky.color > 0;
    setDraftUseEmbed(isEmbed);
    setDraftEmbed({
      title: sticky.embedTitle ?? "",
      description: "",
      color: sticky.color > 0 ? "#" + sticky.color.toString(16).padStart(6, "0") : "",
      image: sticky.embedImage ?? "",
      thumbnail: sticky.embedThumbnail ?? "",
      footer: sticky.embedFooter ?? "",
    });
    setDraftDetectionBehavior(sticky.detectionBehavior ?? "instant");
    setDraftDetectionDelay(sticky.detectionDelay ?? 5);
    setDraftConversationDuration(sticky.conversationDuration ?? 10);
    setDraftConversationDeleteBehavior(sticky.conversationDeleteBehavior ?? "after_conversation");
    setDraftSendOrder(sticky.sendOrder ?? 1);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!draftChannel) {
      toast.error("Please select a channel");
      return;
    }
    if (!draftContent.trim()) {
      toast.error("Content is required");
      return;
    }
    if (draftContent.length > 2000) {
      toast.error("Content must be 2000 characters or less");
      return;
    }

    // Check if channel already has a sticky (and we're not editing that one)
    if (!editing) {
      const existing = stickies.find((s) => s.channelId === draftChannel);
      if (existing) {
        toast.error(`#${existing.channelName} already has a sticky message. Edit or remove it first.`);
        return;
      }
    }

    setSaving(true);
    try {
      // Convert hex color to decimal
      let colorDecimal = 0;
      if (draftUseEmbed && draftEmbed.color) {
        const clean = draftEmbed.color.replace("#", "");
        if (/^[0-9a-fA-F]{1,6}$/.test(clean)) {
          colorDecimal = parseInt(clean, 16);
        }
      }

      const res = await fetchApi<StickyMessage>(guildId, `moderation/stickies/${draftChannel}`, {
        method: "PUT",
        body: JSON.stringify({
          content: draftContent.trim(),
          color: colorDecimal,
          useEmbed: draftUseEmbed,
          embedTitle: draftUseEmbed ? draftEmbed.title || "" : "",
          embedImage: draftUseEmbed ? draftEmbed.image || "" : "",
          embedThumbnail: draftUseEmbed ? draftEmbed.thumbnail || "" : "",
          embedFooter: draftUseEmbed ? draftEmbed.footer || "" : "",
          detectionBehavior: draftDetectionBehavior,
          detectionDelay: draftDetectionDelay,
          conversationDuration: draftConversationDuration,
          conversationDeleteBehavior: draftConversationDeleteBehavior,
          sendOrder: draftSendOrder,
        }),
      });

      if (res.success) {
        toast.success(editing ? "Sticky message updated" : "Sticky message created");
        setModalOpen(false);
        fetchStickies();
      } else {
        toast.error(res.error?.message ?? "Failed to save sticky message");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, `moderation/stickies/${deleteTarget.channelId}`, {
        method: "DELETE",
      });
      if (res.success) {
        toast.success(`Sticky message removed from #${deleteTarget.channelName}`);
        setDeleteTarget(null);
        fetchStickies();
      } else {
        toast.error(res.error?.message ?? "Failed to remove sticky message");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  // ── Toggle ──
  const handleToggle = async (sticky: StickyMessage, enabled: boolean) => {
    if (!canManage) return;
    try {
      const res = await fetchApi(guildId, `moderation/stickies/${sticky.channelId}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      if (res.success) {
        toast.success(enabled ? `Sticky enabled in #${sticky.channelName}` : `Sticky paused in #${sticky.channelName}`);
        fetchStickies();
      } else {
        toast.error(res.error?.message ?? "Failed to toggle sticky message");
      }
    } catch {
      toast.error("Failed to connect to API");
    }
  };

  // ── Loading ──
  if (loading && stickies.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading sticky messages…" />
      </div>
    );
  }

  // ── Error ──
  if (error && stickies.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchStickies} className="mt-3 rounded-lg bg-white/5 backdrop-blur-sm px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10">
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-400">Sticky messages are automatically re-posted at the bottom of a channel whenever new messages are sent.</p>

        {canManage && (
          <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500 shrink-0">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Sticky
          </button>
        )}
      </div>

      {/* Sticky list */}
      {stickies.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 backdrop-blur-sm p-4">
            <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <CardTitle>No Sticky Messages</CardTitle>
          <CardDescription className="mt-2 max-w-md">Add a sticky message to keep important information visible at the bottom of a channel.</CardDescription>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700/30 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                    <th className="pb-3 pr-4">Channel</th>
                    <th className="pb-3 pr-4">Content</th>
                    <th className="pb-3 pr-4">Style</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Updated</th>
                    {canManage && <th className="pb-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700/30">
                  {stickies.map((sticky) => (
                    <tr key={sticky.channelId} className="group">
                      <td className="py-3 pr-4">
                        <span className="font-mono text-sm text-primary-400">#{sticky.channelName}</span>
                      </td>
                      <td className="max-w-[300px] truncate py-3 pr-4 text-zinc-400" title={sticky.content}>
                        {sticky.content}
                      </td>
                      <td className="py-3 pr-4">
                        {!sticky.useEmbed && sticky.color === 0 ? (
                          <span className="text-xs text-zinc-500">Plain text</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {sticky.color > 0 && <span className="inline-block h-3 w-3 rounded-full border border-zinc-600" style={{ backgroundColor: getColorDot(sticky.color) }} />}
                            <span className="text-xs text-zinc-400">Embed</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {canManage ? (
                          <Toggle label="" checked={sticky.enabled} onChange={(v) => handleToggle(sticky, v)} />
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${sticky.enabled ? "border-emerald-500/40 text-emerald-300" : "border-zinc-700/50 text-zinc-500"}`}>
                            {sticky.enabled ? "Active" : "Paused"}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-zinc-500">{new Date(sticky.updatedAt).toLocaleDateString()}</td>
                      {canManage && (
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => openEditModal(sticky)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200">
                              Edit
                            </button>
                            <button onClick={() => setDeleteTarget(sticky)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10">
                              Remove
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Loading overlay for refetch */}
            {loading && stickies.length > 0 && (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Sticky — #${editing.channelName}` : "Add Sticky Message"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !draftChannel || !draftContent.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {editing ? "Update" : "Create"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {/* Channel picker (only for new stickies) */}
          {!editing && (
            <ChannelCombobox
              guildId={guildId}
              value={draftChannel}
              onChange={setDraftChannel}
              channelType="text"
              label="Channel"
              description="Select the text channel for the sticky message"
              placeholder="Select a channel…"
            />
          )}

          {/* Message content — used as embed description when in embed mode */}
          <Textarea
            label={draftUseEmbed ? "Embed Description" : "Message Content"}
            description={draftUseEmbed ? "The main text body of the embed." : "The message that will be pinned at the bottom of the channel."}
            value={draftContent}
            onChange={setDraftContent}
            placeholder="Enter the sticky message content…"
            maxLength={draftUseEmbed ? 4096 : 2000}
            rows={4}
          />

          {/* Embed toggle + editor */}
          <div className="border-t border-zinc-700/30 pt-4 mt-4">
            <Toggle label="Send as Embed" description="Wrap the message in a rich embed with optional title, color, images, and footer" checked={draftUseEmbed} onChange={setDraftUseEmbed} />
          </div>

          {draftUseEmbed && (
            <div className="space-y-3 rounded-lg border border-zinc-700/30 p-4">
              <EmbedEditor value={draftEmbed} onChange={setDraftEmbed} hideHeading descriptionRows={0} />
            </div>
          )}

          {/* Conversation Detection Settings */}
          <div className="border-t border-zinc-700/30 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-sm font-medium text-zinc-300">Conversation Detection</label>
                <p className="text-xs text-zinc-500 mt-0.5">Set how new user messages should be detected. Either instantly delete and resend the sticky message or wait until a conversation ends.</p>
              </div>
              <Toggle label="" checked={draftDetectionBehavior === "delay"} onChange={(v) => setDraftDetectionBehavior(v ? "delay" : "instant")} />
            </div>

            {draftDetectionBehavior === "delay" && (
              <div className="space-y-3 pl-0">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Detection behavior
                      <span className="ml-1 text-zinc-500 text-xs cursor-help" title="How to detect when a new message appears in the channel">
                        ⓘ
                      </span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value="delay" disabled className="rounded-md bg-zinc-800 border border-zinc-600 text-zinc-100 px-3 py-2 text-sm">
                      <option value="delay">With delay</option>
                    </select>
                    <div className="w-20">
                      <TextInput label="" value={String(draftDetectionDelay)} onChange={(v) => setDraftDetectionDelay(Math.max(1, parseInt(v) || 5))} type="number" />
                    </div>
                    <span className="text-sm text-zinc-400">seconds</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Conversation duration
                      <span className="ml-1 text-zinc-500 text-xs cursor-help" title="How long to wait after the last message before considering the conversation ended">
                        ⓘ
                      </span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20">
                      <TextInput label="" value={String(draftConversationDuration)} onChange={(v) => setDraftConversationDuration(Math.max(1, parseInt(v) || 10))} type="number" />
                    </div>
                    <span className="text-sm text-zinc-400">seconds</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Conversation delete behavior
                      <span className="ml-1 text-zinc-500 text-xs cursor-help" title="When to delete the old sticky message">
                        ⓘ
                      </span>
                    </label>
                  </div>
                  <select
                    value={draftConversationDeleteBehavior}
                    onChange={(e) => setDraftConversationDeleteBehavior(e.target.value as "immediate" | "after_conversation")}
                    className="rounded-md bg-zinc-800 border border-zinc-600 text-zinc-100 px-3 py-2 text-sm">
                    <option value="after_conversation">After conversation end</option>
                    <option value="immediate">Immediately</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Send order
                      <span className="ml-1 text-zinc-500 text-xs cursor-help" title="Order priority when channel has multiple automations (lower = first)">
                        ⓘ
                      </span>
                    </label>
                  </div>
                  <div className="w-20">
                    <TextInput label="" value={String(draftSendOrder)} onChange={(v) => setDraftSendOrder(Math.max(1, parseInt(v) || 1))} type="number" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Remove Sticky Message"
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
              {deleting ? "Removing…" : "Remove"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">
          Are you sure you want to remove the sticky message from <span className="font-mono text-primary-400">#{deleteTarget?.channelName}</span>? The current sticky message in the channel will also
          be deleted.
        </p>
      </Modal>
    </div>
  );
}
