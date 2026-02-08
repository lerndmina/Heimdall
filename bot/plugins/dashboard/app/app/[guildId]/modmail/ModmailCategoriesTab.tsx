/**
 * Modmail Categories Management Tab
 *
 * Allows creating, editing, and managing modmail categories with form fields.
 */
"use client";

import { useState, useEffect } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import TextInput from "@/components/ui/TextInput";
import Toggle from "@/components/ui/Toggle";
import { fetchDashboardApi } from "@/lib/api";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  forumChannelId: string;
  webhookId: string;
  staffRoleIds: string[];
  priority: number;
  formFields: FormField[];
  autoCloseHours?: number;
  resolveAutoCloseHours: number;
  enabled: boolean;
}

interface FormField {
  id: string;
  label: string;
  placeholder?: string;
  required: boolean;
  type: "short" | "paragraph" | "select" | "number";
  options?: Array<{ label: string; value: string }>;
}

interface ModmailCategoriesTabProps {
  guildId: string;
}

export default function ModmailCategoriesTab({ guildId }: ModmailCategoriesTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state for add/edit
  const [formData, setFormData] = useState<Partial<Category>>({
    name: "",
    description: "",
    emoji: "",
    forumChannelId: "",
    webhookId: "",
    staffRoleIds: [],
    priority: 0,
    formFields: [],
    resolveAutoCloseHours: 24,
    enabled: true,
  });

  useEffect(() => {
    loadCategories();
  }, [guildId]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetchDashboardApi<{ categories: Category[] }>(`guilds/${guildId}/modmail/config`, {
        method: "GET",
      });

      if (res.success && res.data) {
        setCategories(res.data.categories || []);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.forumChannelId?.trim() || !formData.webhookId?.trim()) {
      toast.error("Name, Forum Channel ID, and Webhook ID are required");
      return;
    }

    setSaving(true);
    try {
      const updatedCategories = [...categories];

      if (editingIndex !== null) {
        // Edit existing
        updatedCategories[editingIndex] = {
          ...updatedCategories[editingIndex],
          ...formData,
        } as Category;
      } else {
        // Add new
        updatedCategories.push({
          id: `cat_${Date.now()}`,
          name: formData.name || "",
          description: formData.description,
          emoji: formData.emoji,
          forumChannelId: formData.forumChannelId || "",
          webhookId: formData.webhookId || "",
          staffRoleIds: formData.staffRoleIds || [],
          priority: formData.priority || 0,
          formFields: formData.formFields || [],
          autoCloseHours: formData.autoCloseHours,
          resolveAutoCloseHours: formData.resolveAutoCloseHours || 24,
          enabled: formData.enabled !== false,
        });
      }

      // Save via API
      const res = await fetchDashboardApi(`guilds/${guildId}/modmail/config`, {
        method: "PUT",
        body: JSON.stringify({ categories: updatedCategories }),
      });

      if (!res.success) {
        throw new Error(res.error?.message || "Failed to save categories");
      }

      setCategories(updatedCategories);
      setShowAddForm(false);
      setEditingIndex(null);
      resetForm();
      toast.success(editingIndex !== null ? "Category updated" : "Category added");
    } catch (error: any) {
      toast.error(error.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (index: number) => {
    const cat = categories[index];
    setFormData(cat);
    setEditingIndex(index);
    setShowAddForm(true);
  };

  const handleDelete = async (index: number) => {
    if (!confirm("Are you sure you want to delete this category?")) return;

    setSaving(true);
    try {
      const updatedCategories = categories.filter((_, i) => i !== index);

      const res = await fetchDashboardApi(`guilds/${guildId}/modmail/config`, {
        method: "PUT",
        body: JSON.stringify({ categories: updatedCategories }),
      });

      if (!res.success) {
        throw new Error(res.error?.message || "Failed to delete category");
      }

      setCategories(updatedCategories);
      toast.success("Category deleted");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete category");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      emoji: "",
      forumChannelId: "",
      webhookId: "",
      staffRoleIds: [],
      priority: 0,
      formFields: [],
      resolveAutoCloseHours: 24,
      enabled: true,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-zinc-600 border-t-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Categories</h2>
          <p className="mt-1 text-sm text-zinc-400">Manage modmail categories with custom forms and workflows</p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => {
              resetForm();
              setEditingIndex(null);
              setShowAddForm(true);
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
            + Add Category
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <Card>
          <CardTitle>{editingIndex !== null ? "Edit Category" : "Add Category"}</CardTitle>
          <CardContent className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <TextInput label="Category Name" description="Display name for this category" value={formData.name || ""} onChange={(val) => setFormData({ ...formData, name: val })} required />

              <TextInput label="Emoji" description="Optional emoji (e.g., 📨)" value={formData.emoji || ""} onChange={(val) => setFormData({ ...formData, emoji: val })} />
            </div>

            <TextInput
              label="Description"
              description="Optional description shown when selecting category"
              value={formData.description || ""}
              onChange={(val) => setFormData({ ...formData, description: val })}
            />

            <div className="grid grid-cols-2 gap-4">
              <TextInput
                label="Forum Channel ID"
                description="Discord forum channel ID where threads are created"
                value={formData.forumChannelId || ""}
                onChange={(val) => setFormData({ ...formData, forumChannelId: val })}
                required
              />

              <TextInput label="Webhook ID" description="Webhook ID for relaying messages" value={formData.webhookId || ""} onChange={(val) => setFormData({ ...formData, webhookId: val })} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextInput
                label="Priority"
                description="Display order (higher = shown first)"
                type="number"
                value={String(formData.priority || 0)}
                onChange={(val) => setFormData({ ...formData, priority: parseInt(val) || 0 })}
              />

              <TextInput
                label="Auto-close After Resolve (hours)"
                description="Hours until thread closes after being resolved"
                type="number"
                value={String(formData.resolveAutoCloseHours || 24)}
                onChange={(val) => setFormData({ ...formData, resolveAutoCloseHours: parseInt(val) || 24 })}
              />
            </div>

            <TextInput
              label="Staff Role IDs"
              description="Comma-separated role IDs that can handle this category"
              value={formData.staffRoleIds?.join(", ") || ""}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  staffRoleIds: val
                    .split(",")
                    .map((id) => id.trim())
                    .filter(Boolean),
                })
              }
            />

            <Toggle
              label="Enabled"
              description="Whether this category is active and available to users"
              checked={formData.enabled !== false}
              onChange={(checked) => setFormData({ ...formData, enabled: checked })}
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setEditingIndex(null);
                  resetForm();
                }}
                disabled={saving}
                className="flex-1 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
                {saving ? "Saving..." : editingIndex !== null ? "Save Changes" : "Add Category"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Categories List */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mb-4 text-4xl">📨</div>
            <p className="text-sm text-zinc-400">No categories configured yet</p>
            <p className="mt-2 text-xs text-zinc-500">Add your first category to start organizing modmail threads</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {categories.map((cat, index) => (
            <Card key={cat.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {cat.emoji && <span className="text-xl">{cat.emoji}</span>}
                      <h3 className="text-base font-medium text-zinc-100">{cat.name}</h3>
                      {!cat.enabled && <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500">Disabled</span>}
                    </div>
                    {cat.description && <p className="mt-1 text-sm text-zinc-400">{cat.description}</p>}

                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <span className="text-zinc-500">Forum Channel:</span> <span className="font-mono text-zinc-400">{cat.forumChannelId}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Webhook:</span> <span className="font-mono text-zinc-400">{cat.webhookId}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Priority:</span> <span className="text-zinc-400">{cat.priority}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Staff Roles:</span> <span className="text-zinc-400">{cat.staffRoleIds.length}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-zinc-500">Auto-close:</span> <span className="text-zinc-400">{cat.resolveAutoCloseHours}h after resolve</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(index)}
                      disabled={saving}
                      className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 disabled:opacity-50">
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(index)}
                      disabled={saving}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
                      Delete
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
