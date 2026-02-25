/**
 * SuggestionsCategoriesTab — CRUD for suggestion categories.
 *
 * API:
 *   GET    /suggestions/categories
 *   POST   /suggestions/categories { name, description, emoji?, channelId?, createdBy }
 *   PUT    /suggestions/categories/:id { name?, description?, emoji?, channelId?, isActive?, updatedBy }
 *   DELETE /suggestions/categories/:id
 *   PUT    /suggestions/categories/reorder { categoryIds[], updatedBy }
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import Toggle from "@/components/ui/Toggle";
import Modal from "@/components/ui/Modal";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import DiscordEmoji from "@/components/ui/DiscordEmoji";
import { NotConfigured } from "@/components/ui/SetupWizard";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface SuggestionCategory {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  channelId?: string;
  isActive: boolean;
  position: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Component ────────────────────────────────────────────

export default function SuggestionsCategoriesTab({ guildId }: { guildId: string }) {
  const canManage = useCanManage("suggestions.manage_categories");

  const [categories, setCategories] = useState<SuggestionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editCat, setEditCat] = useState<SuggestionCategory | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "", emoji: "", channelId: "", isActive: true });
  const [modalSaving, setModalSaving] = useState(false);

  // Delete
  const [deleteCat, setDeleteCat] = useState<SuggestionCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi<SuggestionCategory[]>(guildId, "suggestions/categories", { skipCache: true });
      if (res.success && res.data) {
        setCategories(res.data.sort((a, b) => a.position - b.position));
      } else {
        setError(res.error?.message ?? "Failed to load categories");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useRealtimeEvent("suggestions:updated", () => {
    fetchCategories();
  });

  // ── Create/Edit ──
  const openCreateModal = () => {
    setEditCat(null);
    setDraft({ name: "", description: "", emoji: "", channelId: "", isActive: true });
    setModalOpen(true);
  };

  const openEditModal = (cat: SuggestionCategory) => {
    setEditCat(cat);
    setDraft({
      name: cat.name,
      description: cat.description,
      emoji: cat.emoji ?? "",
      channelId: cat.channelId ?? "",
      isActive: cat.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setModalSaving(true);
    try {
      if (editCat) {
        const res = await fetchApi<SuggestionCategory>(guildId, `suggestions/categories/${editCat.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: draft.name.trim(),
            description: draft.description.trim(),
            emoji: draft.emoji.trim() || undefined,
            channelId: draft.channelId || undefined,
            isActive: draft.isActive,
          }),
        });
        if (res.success) {
          toast.success(`Category "${draft.name}" updated`);
          setModalOpen(false);
          fetchCategories();
        } else {
          toast.error(res.error?.message ?? "Failed to update");
        }
      } else {
        const res = await fetchApi<SuggestionCategory>(guildId, "suggestions/categories", {
          method: "POST",
          body: JSON.stringify({
            name: draft.name.trim(),
            description: draft.description.trim(),
            emoji: draft.emoji.trim() || undefined,
            channelId: draft.channelId || undefined,
          }),
        });
        if (res.success) {
          toast.success(`Category "${draft.name}" created`);
          setModalOpen(false);
          fetchCategories();
        } else {
          toast.error(res.error?.message ?? "Failed to create");
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
    if (!deleteCat) return;
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, `suggestions/categories/${deleteCat.id}`, { method: "DELETE" });
      if (res.success) {
        toast.success(`Category "${deleteCat.name}" deleted`);
        setDeleteCat(null);
        fetchCategories();
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  if (loading && categories.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading categories…" />
      </div>
    );
  }

  if (error) {
    return (
      <NotConfigured
        title="No Categories Available"
        description="Create categories to organize suggestions by topic. Make sure the suggestions plugin is configured in the Configuration tab first."
        onSetup={openCreateModal}
        canSetup={canManage}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-zinc-100">Suggestion Categories</h3>
          <p className="text-sm text-zinc-500">Organize suggestions into categories. Categories must be enabled in configuration.</p>
        </div>
        {canManage && (
          <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Category
          </button>
        )}
      </div>

      {/* Category list */}
      {categories.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <CardTitle>No Categories</CardTitle>
          <CardDescription className="mt-2">Create categories to organize suggestions by topic.</CardDescription>
        </Card>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <Card key={cat.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {cat.emoji && <DiscordEmoji value={cat.emoji} size={20} />}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-200">{cat.name}</p>
                      {!cat.isActive && <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">Inactive</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">{cat.description}</p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditModal(cat)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200" title="Edit">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button onClick={() => setDeleteCat(cat)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400" title="Delete">
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
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editCat ? `Edit Category: ${editCat.name}` : "New Category"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={modalSaving || !draft.name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {modalSaving ? (editCat ? "Updating…" : "Creating…") : editCat ? "Update" : "Create"}
            </button>
          </>
        }>
        <div className="space-y-4">
          <TextInput label="Name" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="Bug Reports" />
          <Textarea label="Description" value={draft.description} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} placeholder="Submit bug reports and issues" rows={3} />
          <TextInput label="Emoji" description="Optional emoji to display with this category" value={draft.emoji} onChange={(v) => setDraft((d) => ({ ...d, emoji: v }))} placeholder="🐛" />
          <ChannelCombobox
            guildId={guildId}
            value={draft.channelId}
            onChange={(v) => setDraft((d) => ({ ...d, channelId: v }))}
            channelType="text"
            excludeForums
            label="Override Channel"
            description="Optional: send suggestions in this category to a specific channel"
          />
          {editCat && (
            <Toggle label="Active" description="Inactive categories won't appear in the category picker" checked={draft.isActive} onChange={(v) => setDraft((d) => ({ ...d, isActive: v }))} />
          )}
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal
        open={deleteCat !== null}
        onClose={() => setDeleteCat(null)}
        title="Delete Category"
        footer={
          <>
            <button onClick={() => setDeleteCat(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
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
          Delete{" "}
          <span className="font-medium text-zinc-200">
            {deleteCat?.emoji} {deleteCat?.name}
          </span>
          ? Existing suggestions won't be affected, but new ones can't use this category.
        </p>
      </Modal>
    </div>
  );
}
