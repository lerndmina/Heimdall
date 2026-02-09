/**
 * TagsPage — searchable, paginated DataTable of tags with full CRUD via modals.
 *
 * API:
 *   GET    /tags?search&sort&limit&offset → { tags[], total }
 *   GET    /tags/:name                    → Tag
 *   POST   /tags          { name, content, createdBy } → Tag
 *   PUT    /tags/:name    { content }                  → Tag
 *   DELETE /tags/:name                                 → { deleted: true }
 */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import Modal from "@/components/ui/Modal";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { useSession } from "next-auth/react";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface Tag {
  _id: string;
  guildId: string;
  name: string;
  content: string;
  createdBy: string;
  uses: number;
  createdAt: string;
  updatedAt: string;
}

interface TagListResponse {
  tags: Tag[];
  total: number;
  limit: number;
  offset: number;
}

// ── Constants ────────────────────────────────────────────

const PAGE_SIZE = 20;
const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "uses", label: "Uses" },
  { value: "createdAt", label: "Created" },
] as const;

// ── Component ────────────────────────────────────────────

export default function TagsPage({ guildId }: { guildId: string }) {
  const canManage = useCanManage("tags.manage");
  const { data: session } = useSession();

  // List state
  const [tags, setTags] = useState<Tag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("name");
  const [page, setPage] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──
  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("sort", sort);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetchApi<TagListResponse>(guildId, `tags?${params.toString()}`, { skipCache: true });
      if (res.success && res.data) {
        setTags(res.data.tags);
        setTotal(res.data.total);
      } else {
        setError(res.error?.message ?? "Failed to load tags");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId, search, sort, page]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useRealtimeEvent("tags:updated", () => {
    fetchTags();
  });

  // Reset to page 0 when search/sort changes
  useEffect(() => {
    setPage(0);
  }, [search, sort]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Create / Edit ──
  const openCreateModal = () => {
    setEditTag(null);
    setDraftName("");
    setDraftContent("");
    setNameError(null);
    setModalOpen(true);
  };

  const openEditModal = (tag: Tag) => {
    setEditTag(tag);
    setDraftName(tag.name);
    setDraftContent(tag.content);
    setNameError(null);
    setModalOpen(true);
  };

  const validateName = (name: string): boolean => {
    if (!name.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setNameError("Only letters, numbers, hyphens, and underscores");
      return false;
    }
    if (name.length > 32) {
      setNameError("Maximum 32 characters");
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleSaveTag = async () => {
    if (!editTag && !validateName(draftName)) return;
    if (!draftContent.trim()) {
      toast.error("Content is required");
      return;
    }

    setModalSaving(true);
    try {
      if (editTag) {
        // Update
        const res = await fetchApi<Tag>(guildId, `tags/${encodeURIComponent(editTag.name)}`, {
          method: "PUT",
          body: JSON.stringify({ content: draftContent }),
        });
        if (res.success) {
          toast.success(`Tag "${editTag.name}" updated`);
          setModalOpen(false);
          fetchTags();
        } else {
          toast.error(res.error?.message ?? "Failed to update tag");
        }
      } else {
        // Create
        const res = await fetchApi<Tag>(guildId, "tags", {
          method: "POST",
          body: JSON.stringify({
            name: draftName.trim(),
            content: draftContent,
            createdBy: session?.user?.id ?? "dashboard",
          }),
        });
        if (res.success) {
          toast.success(`Tag "${draftName}" created`);
          setModalOpen(false);
          fetchTags();
        } else {
          if (res.error?.code === "ALREADY_EXISTS") {
            setNameError("A tag with this name already exists");
          } else {
            toast.error(res.error?.message ?? "Failed to create tag");
          }
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
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, `tags/${encodeURIComponent(deleteTarget.name)}`, {
        method: "DELETE",
      });
      if (res.success) {
        toast.success(`Tag "${deleteTarget.name}" deleted`);
        setDeleteTarget(null);
        fetchTags();
      } else {
        toast.error(res.error?.message ?? "Failed to delete tag");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  // ====== Loading (initial) ======
  if (loading && tags.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading tags…" />
      </div>
    );
  }

  // ====== Error ======
  if (error && tags.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchTags} className="mt-3 rounded-lg bg-white/5 backdrop-blur-sm px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10">
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
        <div className="flex items-center gap-3">
          <TextInput label="Search" placeholder="Search tags…" value={search} onChange={setSearch} />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-3 py-2 text-sm text-zinc-200 outline-none transition focus:border-primary-500">
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
        </div>

        {canManage && (
          <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Tag
          </button>
        )}
      </div>

      {/* Tag list */}
      {tags.length === 0 && !loading ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 backdrop-blur-sm p-4">
            <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
          </div>
          <CardTitle>{search ? "No tags found" : "No Tags Yet"}</CardTitle>
          <CardDescription className="mt-2 max-w-md">
            {search ? `No tags matched "${search}".` : "Create your first tag to get started. Tags let users quickly share reusable messages."}
          </CardDescription>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700/30 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Content</th>
                    <th className="pb-3 pr-4">Uses</th>
                    <th className="pb-3 pr-4">Created</th>
                    {canManage && <th className="pb-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700/30">
                  {tags.map((tag) => (
                    <tr key={tag.name} className="group">
                      <td className="py-3 pr-4">
                        <span className="font-mono text-sm text-primary-400">{tag.name}</span>
                      </td>
                      <td className="max-w-[300px] truncate py-3 pr-4 text-zinc-400" title={tag.content}>
                        {tag.content}
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">{tag.uses}</td>
                      <td className="py-3 pr-4 text-zinc-500">{new Date(tag.createdAt).toLocaleDateString()}</td>
                      {canManage && (
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => openEditModal(tag)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200">
                              Edit
                            </button>
                            <button onClick={() => setDeleteTarget(tag)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10">
                              Delete
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
            {loading && tags.length > 0 && (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-zinc-700/30 pt-4">
                <p className="text-xs text-zinc-500">
                  {total} tag{total !== 1 ? "s" : ""} total
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

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTag ? `Edit Tag: ${editTag.name}` : "Create Tag"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleSaveTag}
              disabled={modalSaving || (!editTag && !draftName.trim()) || !draftContent.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {modalSaving && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {editTag ? "Update" : "Create"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {!editTag && (
            <TextInput
              label="Tag Name"
              description="Letters, numbers, hyphens, and underscores only. Max 32 characters."
              value={draftName}
              onChange={(v) => {
                setDraftName(v);
                if (nameError) validateName(v);
              }}
              placeholder="my-tag"
              error={nameError ?? undefined}
            />
          )}
          <Textarea label="Content" description="The message sent when this tag is used." value={draftContent} onChange={setDraftContent} placeholder="Enter tag content…" maxLength={2000} rows={6} />
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Tag"
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
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">
          Are you sure you want to delete the tag <span className="font-mono text-primary-400">{deleteTarget?.name}</span>? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
