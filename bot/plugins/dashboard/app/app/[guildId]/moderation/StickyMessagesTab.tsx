"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Toggle from "@/components/ui/Toggle";
import Textarea from "@/components/ui/Textarea";
import TextInput from "@/components/ui/TextInput";
import Modal from "@/components/ui/Modal";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
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
  currentMessageId?: string;
  moderatorId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Color Helpers ────────────────────────────────────────

const COLOR_PRESETS: { label: string; value: number }[] = [
  { label: "No Embed (plain text)", value: 0 },
  { label: "Blue", value: 0x5865f2 },
  { label: "Green", value: 0x57f287 },
  { label: "Yellow", value: 0xfee75c },
  { label: "Red", value: 0xed4245 },
  { label: "Orange", value: 0xe67e22 },
  { label: "Purple", value: 0x9b59b6 },
  { label: "White", value: 0xffffff },
];

function decimalToHex(decimal: number): string {
  if (decimal === 0) return "";
  return "#" + decimal.toString(16).padStart(6, "0");
}

function hexToDecimal(hex: string): number {
  if (!hex || hex === "#") return 0;
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{1,6}$/.test(clean)) return 0;
  return parseInt(clean, 16);
}

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
  const [draftColor, setDraftColor] = useState(0);
  const [draftColorHex, setDraftColorHex] = useState("");
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
    setDraftColor(0);
    setDraftColorHex("");
    setModalOpen(true);
  };

  const openEditModal = (sticky: StickyMessage) => {
    setEditing(sticky);
    setDraftChannel(sticky.channelId);
    setDraftContent(sticky.content);
    setDraftColor(sticky.color);
    setDraftColorHex(decimalToHex(sticky.color));
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
      const res = await fetchApi<StickyMessage>(guildId, `moderation/stickies/${draftChannel}`, {
        method: "PUT",
        body: JSON.stringify({
          content: draftContent.trim(),
          color: draftColor,
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

  // ── Color preset handler ──
  const selectColorPreset = (value: number) => {
    setDraftColor(value);
    setDraftColorHex(decimalToHex(value));
  };

  const handleHexChange = (hex: string) => {
    setDraftColorHex(hex);
    setDraftColor(hexToDecimal(hex));
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
        <p className="text-sm text-zinc-400">
          Sticky messages are automatically re-posted at the bottom of a channel whenever new messages are sent.
        </p>

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
          <CardDescription className="mt-2 max-w-md">
            Add a sticky message to keep important information visible at the bottom of a channel.
          </CardDescription>
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
                        {sticky.color === 0 ? (
                          <span className="text-xs text-zinc-500">Plain text</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-3 w-3 rounded-full border border-zinc-600" style={{ backgroundColor: getColorDot(sticky.color) }} />
                            <span className="text-xs text-zinc-400">Embed</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {canManage ? (
                          <Toggle checked={sticky.enabled} onChange={(v) => handleToggle(sticky, v)} />
                        ) : (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${sticky.enabled ? "border-emerald-500/40 text-emerald-300" : "border-zinc-700/50 text-zinc-500"}`}>
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

          {/* Content */}
          <Textarea
            label="Message Content"
            description="The message that will be pinned at the bottom of the channel."
            value={draftContent}
            onChange={setDraftContent}
            placeholder="Enter the sticky message content…"
            maxLength={2000}
            rows={5}
          />

          {/* Color presets */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Embed Color</label>
            <p className="mb-2 text-xs text-zinc-500">Plain text sends as a regular message. Choosing a color wraps the message in an embed.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => selectColorPreset(preset.value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    draftColor === preset.value
                      ? "border-primary-500 bg-primary-500/10 text-primary-300"
                      : "border-zinc-700/30 text-zinc-400 hover:bg-white/5"
                  }`}>
                  {preset.value !== 0 && (
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getColorDot(preset.value) }} />
                  )}
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom hex input */}
            <TextInput
              label=""
              value={draftColorHex}
              onChange={handleHexChange}
              placeholder="#5865f2"
              description="Or enter a custom hex color"
            />
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
          Are you sure you want to remove the sticky message from <span className="font-mono text-primary-400">#{deleteTarget?.channelName}</span>?
          The current sticky message in the channel will also be deleted.
        </p>
      </Modal>
    </div>
  );
}
