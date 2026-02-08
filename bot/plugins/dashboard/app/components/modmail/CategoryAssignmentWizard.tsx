/**
 * Category Assignment Wizard
 *
 * Allows assignment of categories to imported modmail threads after migration.
 */
"use client";

import { useState, useEffect } from "react";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { fetchDashboardApi } from "@/lib/api";
import { toast } from "sonner";

interface ModmailThread {
  id: string;
  ticketNumber: number;
  userId: string;
  userDisplayName: string;
  status: "open" | "resolved" | "closed";
  categoryId?: string;
  categoryName?: string;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  enabled: boolean;
}

interface CategoryAssignmentWizardProps {
  guildId: string;
  onClose?: () => void;
  onComplete?: () => void;
}

export default function CategoryAssignmentWizard({ guildId, onClose, onComplete }: CategoryAssignmentWizardProps) {
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<ModmailThread[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");

  useEffect(() => {
    loadData();
  }, [guildId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch open modmail threads
      const threadsRes = await fetchDashboardApi<{
        conversations: ModmailThread[];
      }>(`guilds/${guildId}/modmail/conversations?status=open&limit=1000`, {
        method: "GET",
      });

      if (!threadsRes.success || !threadsRes.data) {
        throw new Error("Failed to load modmail threads");
      }

      // Fetch categories from config
      const configRes = await fetchDashboardApi<{
        categories: Category[];
      }>(`guilds/${guildId}/modmail/config`, {
        method: "GET",
      });

      if (!configRes.success || !configRes.data) {
        throw new Error("Failed to load modmail configuration");
      }

      const openThreads = threadsRes.data.conversations;
      const availableCategories = configRes.data.categories.filter((c) => c.enabled);

      setThreads(openThreads);
      setCategories(availableCategories);

      // Initialize assignments with existing categoryId or first available category
      const initialAssignments: Record<string, string> = {};
      for (const thread of openThreads) {
        if (thread.categoryId && availableCategories.some((c) => c.id === thread.categoryId)) {
          initialAssignments[thread.id] = thread.categoryId;
        } else if (availableCategories.length > 0) {
          initialAssignments[thread.id] = availableCategories[0].id;
        }
      }
      setAssignments(initialAssignments);

      if (availableCategories.length > 0) {
        setBulkCategoryId(availableCategories[0].id);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssign = () => {
    if (!bulkCategoryId) return;

    const newAssignments: Record<string, string> = {};
    for (const thread of threads) {
      newAssignments[thread.id] = bulkCategoryId;
    }
    setAssignments(newAssignments);
    toast.success("All threads assigned to selected category");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Prepare updates
      const updates = Object.entries(assignments).map(([modmailId, categoryId]) => {
        const category = categories.find((c) => c.id === categoryId);
        return {
          modmailId,
          categoryId,
          categoryName: category?.name || "",
        };
      });

      const res = await fetchDashboardApi<{
        updatedCount: number;
        failedUpdates: Array<{ modmailId: string; reason: string }>;
      }>(`guilds/${guildId}/modmail/conversations/bulk-update-categories`, {
        method: "PATCH",
        body: JSON.stringify({ updates }),
      });

      if (!res.success || !res.data) {
        throw new Error(res.error?.message || "Failed to update categories");
      }

      const { updatedCount, failedUpdates } = res.data;

      if (failedUpdates.length > 0) {
        toast.warning(`Updated ${updatedCount} threads, ${failedUpdates.length} failed`);
      } else {
        toast.success(`Successfully updated ${updatedCount} threads`);
      }

      onComplete?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to save category assignments");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardTitle>Assign Categories to Imported Threads</CardTitle>
        <CardContent className="mt-4 text-center">
          <div className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-zinc-600 border-t-primary-500" />
          <p className="mt-4 text-sm text-zinc-400">Loading threads and categories...</p>
        </CardContent>
      </Card>
    );
  }

  if (categories.length === 0) {
    return (
      <Card>
        <CardTitle>Assign Categories to Imported Threads</CardTitle>
        <CardContent className="mt-4 space-y-4">
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
            <p className="font-semibold">⚠️ No Categories Configured</p>
            <p className="mt-2 text-xs text-yellow-300">
              You need to set up at least one modmail category before you can assign imported threads. Please configure categories with forum channels and webhooks first.
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="w-full rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600">
              Close
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (threads.length === 0) {
    return (
      <Card>
        <CardTitle>Assign Categories to Imported Threads</CardTitle>
        <CardContent className="mt-4 space-y-4">
          <div className="rounded-lg border border-zinc-600 bg-zinc-800/30 px-4 py-3 text-sm text-zinc-400">
            <p className="font-semibold">✅ No Open Threads to Assign</p>
            <p className="mt-2 text-xs text-zinc-500">There are no open modmail threads that need category assignment. All imported threads either already have valid categories or are closed.</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="w-full rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600">
              Close
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Assign Categories to Imported Threads</CardTitle>
      <CardContent className="mt-4 space-y-4">
        {/* Info */}
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-400">
          <p className="font-semibold">📨 {threads.length} Open Threads Found</p>
          <p className="mt-2 text-xs text-blue-300">
            Imported threads reference old category IDs that don't exist in your new configuration. Assign them to your new categories so staff can send messages through the correct webhooks and forum
            channels.
          </p>
        </div>

        {/* Bulk Assignment */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          <h3 className="text-sm font-medium text-zinc-300">Bulk Assign</h3>
          <p className="mt-1 text-xs text-zinc-500">Quickly assign all threads to the same category</p>
          <div className="mt-3 flex gap-2">
            <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)} className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100">
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji ? `${cat.emoji} ` : ""}
                  {cat.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkCategoryId}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
              Apply to All
            </button>
          </div>
        </div>

        {/* Individual Assignments */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">Individual Assignments</h3>
          <div className="max-h-100 space-y-2 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800/30 p-3">
            {threads.map((thread) => {
              const currentCategory = categories.find((c) => c.id === assignments[thread.id]);
              return (
                <div key={thread.id} className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-500">#{thread.ticketNumber}</span>
                      <span className="text-sm font-medium text-zinc-200">{thread.userDisplayName}</span>
                    </div>
                    {thread.categoryName && <p className="mt-1 text-xs text-zinc-500">Old category: {thread.categoryName}</p>}
                  </div>
                  <select
                    value={assignments[thread.id] || ""}
                    onChange={(e) =>
                      setAssignments({
                        ...assignments,
                        [thread.id]: e.target.value,
                      })
                    }
                    className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100">
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.emoji ? `${cat.emoji} ` : ""}
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {onClose && (
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed">
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || Object.keys(assignments).length === 0}
            className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {saving ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Saving...</span>
              </>
            ) : (
              <>Save Assignments</>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
