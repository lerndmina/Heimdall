/**
 * TicketOpenersTab — CRUD for ticket openers and archive config.
 *
 * API:
 *   GET    /tickets/openers
 *   POST   /tickets/openers
 *   PATCH  /tickets/openers/:id
 *   DELETE /tickets/openers/:id
 *   PATCH  /tickets/openers/:id/categories { add?, remove? }
 *   GET    /tickets/archive-config
 *   PATCH  /tickets/archive-config
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import NumberInput from "@/components/ui/NumberInput";
import Modal from "@/components/ui/Modal";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface TicketOpener {
  id: string;
  guildId: string;
  name: string;
  messageId?: string;
  channelId?: string;
  embedTitle: string;
  embedDescription: string;
  embedColor?: number;
  embedImage?: string;
  embedThumbnail?: string;
  uiType: "buttons" | "dropdown";
  categoryIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketCategory {
  id: string;
  name: string;
  emoji?: string;
  type: "parent" | "child";
}

interface ArchiveConfig {
  guildId: string;
  archiveCategoryId: string;
  archiveExpireDays: number;
  transcriptChannelId?: string;
  transcriptWebhookUrl?: string;
  configured?: boolean;
}

// ── Component ────────────────────────────────────────────

export default function TicketOpenersTab({ guildId }: { guildId: string }) {
  const canManage = useCanManage("tickets.manage_openers");

  const [openers, setOpeners] = useState<TicketOpener[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [archiveConfig, setArchiveConfig] = useState<ArchiveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit/Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editOpener, setEditOpener] = useState<TicketOpener | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    embedTitle: "",
    embedDescription: "",
    embedColor: "",
    embedImage: "",
    embedThumbnail: "",
    uiType: "buttons" as "buttons" | "dropdown",
    categoryIds: [] as string[],
  });
  const [modalSaving, setModalSaving] = useState(false);

  // Delete
  const [deleteOpener, setDeleteOpener] = useState<TicketOpener | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Archive config dirty
  const [archDraft, setArchDraft] = useState<ArchiveConfig | null>(null);
  const [archDirty, setArchDirty] = useState(false);
  const [archSaving, setArchSaving] = useState(false);

  // ── Fetch ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [oRes, cRes, aRes] = await Promise.all([
        fetchApi<TicketOpener[]>(guildId, "tickets/openers", { skipCache: true }),
        fetchApi<TicketCategory[]>(guildId, "tickets/categories", { skipCache: true }),
        fetchApi<ArchiveConfig>(guildId, "tickets/archive-config", { skipCache: true }),
      ]);
      if (oRes.success && oRes.data) setOpeners(oRes.data);
      if (cRes.success && cRes.data) setCategories(cRes.data);
      if (aRes.success && aRes.data) {
        setArchiveConfig(aRes.data);
        setArchDraft(aRes.data);
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useRealtimeEvent("tickets:updated", () => {
    fetchAll();
  });

  const getCategoryName = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    return cat ? `${cat.emoji ?? ""} ${cat.name}`.trim() : id;
  };

  // ── Create/Edit ──
  const openCreateModal = () => {
    setEditOpener(null);
    setDraft({
      name: "",
      embedTitle: "",
      embedDescription: "",
      embedColor: "#5865f2",
      embedImage: "",
      embedThumbnail: "",
      uiType: "buttons",
      categoryIds: [],
    });
    setModalOpen(true);
  };

  const openEditModal = (op: TicketOpener) => {
    setEditOpener(op);
    setDraft({
      name: op.name,
      embedTitle: op.embedTitle,
      embedDescription: op.embedDescription,
      embedColor: op.embedColor ? `#${op.embedColor.toString(16).padStart(6, "0")}` : "#5865f2",
      embedImage: op.embedImage ?? "",
      embedThumbnail: op.embedThumbnail ?? "",
      uiType: op.uiType,
      categoryIds: [...op.categoryIds],
    });
    setModalOpen(true);
  };

  const toggleCategory = (catId: string) => {
    setDraft((d) => ({
      ...d,
      categoryIds: d.categoryIds.includes(catId) ? d.categoryIds.filter((id) => id !== catId) : [...d.categoryIds, catId],
    }));
  };

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.embedTitle.trim() || !draft.embedDescription.trim()) {
      toast.error("Name, title, and description are required");
      return;
    }
    if (draft.categoryIds.length === 0) {
      toast.error("Select at least one category");
      return;
    }
    if (draft.categoryIds.length > 25) {
      toast.error("Maximum 25 categories per opener");
      return;
    }

    const colorNum = parseInt(draft.embedColor.replace("#", ""), 16) || 0x5865f2;
    setModalSaving(true);

    try {
      if (editOpener) {
        // Update opener fields
        const body: Record<string, any> = {
          name: draft.name.trim(),
          embedTitle: draft.embedTitle.trim(),
          embedDescription: draft.embedDescription.trim(),
          embedColor: colorNum,
          embedImage: draft.embedImage.trim() || undefined,
          embedThumbnail: draft.embedThumbnail.trim() || undefined,
          uiType: draft.uiType,
        };
        const res = await fetchApi(guildId, `tickets/openers/${editOpener.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (!res.success) {
          toast.error(res.error?.message ?? "Failed to update opener");
          setModalSaving(false);
          return;
        }

        // Sync categories via add/remove
        const oldIds = new Set(editOpener.categoryIds);
        const newIds = new Set(draft.categoryIds);
        const add = draft.categoryIds.filter((id) => !oldIds.has(id));
        const remove = editOpener.categoryIds.filter((id) => !newIds.has(id));
        if (add.length || remove.length) {
          const catRes = await fetchApi(guildId, `tickets/openers/${editOpener.id}/categories`, {
            method: "PATCH",
            body: JSON.stringify({ add: add.length ? add : undefined, remove: remove.length ? remove : undefined }),
          });
          if (!catRes.success) {
            toast.error(catRes.error?.message ?? "Opener saved but category sync failed");
          }
        }
        toast.success(`Opener "${draft.name}" updated`);
        setModalOpen(false);
        fetchAll();
      } else {
        const body = {
          name: draft.name.trim(),
          embedTitle: draft.embedTitle.trim(),
          embedDescription: draft.embedDescription.trim(),
          embedColor: colorNum,
          embedImage: draft.embedImage.trim() || undefined,
          embedThumbnail: draft.embedThumbnail.trim() || undefined,
          uiType: draft.uiType,
          categoryIds: draft.categoryIds,
        };
        const res = await fetchApi(guildId, "tickets/openers", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res.success) {
          toast.success(`Opener "${draft.name}" created`);
          setModalOpen(false);
          fetchAll();
        } else {
          toast.error(res.error?.message ?? "Failed to create opener");
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
    if (!deleteOpener) return;
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, `tickets/openers/${deleteOpener.id}`, { method: "DELETE" });
      if (res.success) {
        toast.success(`Opener "${deleteOpener.name}" deleted`);
        setDeleteOpener(null);
        fetchAll();
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  // ── Archive Config ──
  const handleArchiveSave = async () => {
    if (!archDraft) return;
    if (!archDraft.archiveCategoryId) {
      toast.error("Archive category is required");
      return;
    }
    setArchSaving(true);
    try {
      const body = {
        archiveCategoryId: archDraft.archiveCategoryId,
        archiveExpireDays: archDraft.archiveExpireDays,
        transcriptChannelId: archDraft.transcriptChannelId || undefined,
        transcriptWebhookUrl: archDraft.transcriptWebhookUrl || undefined,
      };
      const res = await fetchApi(guildId, "tickets/archive-config", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (res.success) {
        toast.success("Archive config saved");
        setArchDirty(false);
        fetchAll();
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setArchSaving(false);
    }
  };

  if (loading && openers.length === 0 && categories.length === 0 && !archiveConfig) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading openers…" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Openers section ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-zinc-100">Ticket Openers</h3>
            <p className="text-sm text-zinc-500">Openers are embed messages with buttons or dropdowns that users click to open tickets.</p>
          </div>
          {canManage && (
            <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Opener
            </button>
          )}
        </div>

        {openers.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-12 text-center">
            <CardTitle>No Openers</CardTitle>
            <CardDescription className="mt-2">Create an opener to let users open tickets from a channel.</CardDescription>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {openers.map((op) => (
              <Card key={op.id}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-200">{op.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-400">{op.uiType === "buttons" ? "Buttons" : "Dropdown"}</span>
                      <span className="text-xs text-zinc-500">{op.categoryIds.length} categories</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(op)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200" title="Edit">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button onClick={() => setDeleteOpener(op)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400" title="Delete">
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

                {/* Embed preview */}
                <CardContent className="mt-3">
                  <div className="rounded-lg border-l-4 p-3 bg-white/5 backdrop-blur-sm" style={{ borderColor: op.embedColor ? `#${op.embedColor.toString(16).padStart(6, "0")}` : "#5865f2" }}>
                    <p className="text-sm font-semibold text-zinc-200">{op.embedTitle}</p>
                    <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{op.embedDescription}</p>
                  </div>

                  {/* Category list */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {op.categoryIds.map((cid) => (
                      <span key={cid} className="inline-flex items-center rounded bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                        {getCategoryName(cid)}
                      </span>
                    ))}
                  </div>

                  {op.channelId && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Posted in channel <span className="font-mono text-zinc-400">{op.channelId}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Archive Config section ── */}
      <section className="space-y-4">
        <h3 className="text-lg font-medium text-zinc-100">Archive Settings</h3>
        {archDraft && (
          <Card>
            <div className="space-y-4">
              <ChannelCombobox
                guildId={guildId}
                value={archDraft.archiveCategoryId ?? ""}
                onChange={(v) => {
                  setArchDraft((d) => (d ? { ...d, archiveCategoryId: v } : d));
                  setArchDirty(true);
                }}
                channelType="category"
                label="Archive Discord Category"
                description="Closed tickets are moved here before deletion"
              />
              <NumberInput
                label="Archive Expire Days"
                description="Days before archived tickets are permanently deleted"
                value={archDraft.archiveExpireDays ?? 30}
                onChange={(v) => {
                  setArchDraft((d) => (d ? { ...d, archiveExpireDays: v } : d));
                  setArchDirty(true);
                }}
                min={1}
                max={365}
              />
              <ChannelCombobox
                guildId={guildId}
                value={archDraft.transcriptChannelId ?? ""}
                onChange={(v) => {
                  setArchDraft((d) => (d ? { ...d, transcriptChannelId: v } : d));
                  setArchDirty(true);
                }}
                channelType="text"
                label="Transcript Channel"
                description="Optional channel to post ticket transcripts"
              />
              <TextInput
                label="Transcript Webhook URL"
                description="Optional webhook URL for posting transcripts"
                value={archDraft.transcriptWebhookUrl ?? ""}
                onChange={(v) => {
                  setArchDraft((d) => (d ? { ...d, transcriptWebhookUrl: v } : d));
                  setArchDirty(true);
                }}
                placeholder="https://discord.com/api/webhooks/..."
              />
            </div>

            {archDirty && canManage && (
              <div className="mt-4 flex items-center justify-end gap-2 border-t border-zinc-700/30 pt-4">
                <button
                  onClick={() => {
                    setArchDraft(archiveConfig);
                    setArchDirty(false);
                  }}
                  className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5">
                  Discard
                </button>
                <button
                  onClick={handleArchiveSave}
                  disabled={archSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50">
                  {archSaving ? "Saving…" : "Save Archive Settings"}
                </button>
              </div>
            )}
          </Card>
        )}
      </section>

      {/* ── Create/Edit Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editOpener ? `Edit: ${editOpener.name}` : "New Opener"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={modalSaving || !draft.name.trim() || !draft.embedTitle.trim() || !draft.embedDescription.trim() || draft.categoryIds.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {modalSaving ? (editOpener ? "Updating…" : "Creating…") : editOpener ? "Update" : "Create"}
            </button>
          </>
        }>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <TextInput label="Name" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="Support Opener" />

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">UI Type</label>
            <select
              value={draft.uiType}
              onChange={(e) => setDraft((d) => ({ ...d, uiType: e.target.value as "buttons" | "dropdown" }))}
              className="w-full rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-3 py-2 text-sm text-zinc-200 outline-none focus:border-primary-500">
              <option value="buttons">Buttons</option>
              <option value="dropdown">Dropdown</option>
            </select>
          </div>

          <hr className="border-zinc-700/30" />
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Embed</p>

          <TextInput label="Title" value={draft.embedTitle} onChange={(v) => setDraft((d) => ({ ...d, embedTitle: v }))} placeholder="Open a Ticket" />
          <Textarea
            label="Description"
            value={draft.embedDescription}
            onChange={(v) => setDraft((d) => ({ ...d, embedDescription: v }))}
            placeholder="Click a button below to open a ticket."
            rows={3}
          />
          <TextInput label="Color" description="Hex colour for embed sidebar" value={draft.embedColor} onChange={(v) => setDraft((d) => ({ ...d, embedColor: v }))} placeholder="#5865f2" />
          <TextInput label="Image URL" description="Large image at bottom of embed" value={draft.embedImage} onChange={(v) => setDraft((d) => ({ ...d, embedImage: v }))} placeholder="https://…" />
          <TextInput
            label="Thumbnail URL"
            description="Small image in top-right of embed"
            value={draft.embedThumbnail}
            onChange={(v) => setDraft((d) => ({ ...d, embedThumbnail: v }))}
            placeholder="https://…"
          />

          <hr className="border-zinc-700/30" />
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Categories</p>
          <p className="text-xs text-zinc-500">Select 1–25 categories this opener provides.</p>

          {categories.filter((c) => c.type === "child").length === 0 ? (
            <p className="text-xs text-yellow-500">No child categories available — create some first.</p>
          ) : (
            <div className="grid gap-2 max-h-48 overflow-y-auto">
              {categories
                .filter((c) => c.type === "child")
                .map((cat) => {
                  const selected = draft.categoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selected ? "border-primary-600 bg-primary-600/10 text-primary-300" : "border-zinc-700/30 bg-white/5 text-zinc-300 hover:bg-white/10"
                      }`}>
                      <span className={`h-4 w-4 rounded border flex items-center justify-center transition ${selected ? "border-primary-500 bg-primary-500" : "border-zinc-600"}`}>
                        {selected && (
                          <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {cat.emoji && <span>{cat.emoji}</span>}
                      {cat.name}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteOpener !== null}
        onClose={() => setDeleteOpener(null)}
        title="Delete Opener"
        footer={
          <>
            <button onClick={() => setDeleteOpener(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">
          Delete opener <span className="font-medium text-zinc-200">"{deleteOpener?.name}"</span>? The posted message in Discord will remain but won't work.
        </p>
      </Modal>
    </div>
  );
}
