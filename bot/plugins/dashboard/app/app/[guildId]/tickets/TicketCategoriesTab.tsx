/**
 * TicketCategoriesTab — full CRUD for ticket categories (parent/child)
 * with inactivity reminder settings, staff roles, and questions.
 * Includes a setup wizard when no categories exist.
 *
 * API:
 *   GET    /tickets/categories?type&isActive
 *   POST   /tickets/categories { name, description, emoji?, type, parentId?, discordCategoryId?, staffRoles?, ticketNameFormat?, inactivityReminder? }
 *   PATCH  /tickets/categories/:id { name?, description?, emoji?, staffRoles?, ticketNameFormat?, isActive?, inactivityReminder? }
 *   DELETE /tickets/categories/:id
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import Toggle from "@/components/ui/Toggle";
import NumberInput from "@/components/ui/NumberInput";
import Modal from "@/components/ui/Modal";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface StaffRole {
  roleId: string;
  shouldPing: boolean;
}

interface InactivityReminder {
  enabled: boolean;
  warningDelay: number;
  closeDelay: number;
  pingBehavior: "opener" | "all" | "none";
  checkIntervalMinutes: number;
}

interface TicketCategory {
  _id: string;
  id: string;
  guildId: string;
  name: string;
  description: string;
  emoji?: string;
  type: "parent" | "child";
  parentId?: string;
  childIds: string[];
  discordCategoryId?: string;
  staffRoles: StaffRole[];
  ticketNameFormat: string;
  inactivityReminder: InactivityReminder;
  isActive: boolean;
  createdBy: string;
}

// ── Component ────────────────────────────────────────────

export default function TicketCategoriesTab({ guildId }: { guildId: string }) {
  const canManage = useCanManage("tickets.manage_categories");

  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editCat, setEditCat] = useState<TicketCategory | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    emoji: "",
    type: "child" as "parent" | "child",
    parentId: "",
    discordCategoryId: "",
    ticketNameFormat: "{number}-{openerusername}",
    isActive: true,
    inactivityEnabled: true,
    inactivityWarningDelay: 24,
    inactivityCloseDelay: 72,
    inactivityPingBehavior: "opener" as "opener" | "all" | "none",
  });
  const [modalSaving, setModalSaving] = useState(false);

  // Delete
  const [deleteCat, setDeleteCat] = useState<TicketCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Setup wizard
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardParent, setWizardParent] = useState({
    name: "",
    description: "",
    emoji: "📂",
  });
  const [wizardChild, setWizardChild] = useState({
    name: "",
    description: "",
    emoji: "🎫",
    discordCategoryId: "",
    ticketNameFormat: "{number}-{openerusername}",
  });

  // ── Fetch ──
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi<TicketCategory[]>(guildId, "tickets/categories", { skipCache: true });
      if (res.success && res.data) {
        setCategories(res.data);
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

  useRealtimeEvent("dashboard:data_changed", () => {
    fetchCategories();
  });

  const parents = categories.filter((c) => c.type === "parent");
  const children = categories.filter((c) => c.type === "child");

  // ── Create/Edit ──
  const openCreateModal = () => {
    setEditCat(null);
    setDraft({
      name: "",
      description: "",
      emoji: "",
      type: "child",
      parentId: parents[0]?.id ?? "",
      discordCategoryId: "",
      ticketNameFormat: "{number}-{openerusername}",
      isActive: true,
      inactivityEnabled: true,
      inactivityWarningDelay: 24,
      inactivityCloseDelay: 72,
      inactivityPingBehavior: "opener",
    });
    setModalOpen(true);
  };

  const openEditModal = (cat: TicketCategory) => {
    setEditCat(cat);
    setDraft({
      name: cat.name,
      description: cat.description,
      emoji: cat.emoji ?? "",
      type: cat.type,
      parentId: cat.parentId ?? "",
      discordCategoryId: cat.discordCategoryId ?? "",
      ticketNameFormat: cat.ticketNameFormat,
      isActive: cat.isActive,
      inactivityEnabled: cat.inactivityReminder?.enabled ?? true,
      inactivityWarningDelay: (cat.inactivityReminder?.warningDelay ?? 86_400_000) / 3_600_000,
      inactivityCloseDelay: (cat.inactivityReminder?.closeDelay ?? 259_200_000) / 3_600_000,
      inactivityPingBehavior: cat.inactivityReminder?.pingBehavior ?? "opener",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.description.trim()) {
      toast.error("Name and description are required");
      return;
    }
    setModalSaving(true);
    try {
      if (editCat) {
        const body: Record<string, any> = {
          name: draft.name.trim(),
          description: draft.description.trim(),
          emoji: draft.emoji.trim() || undefined,
          ticketNameFormat: draft.ticketNameFormat,
          isActive: draft.isActive,
          inactivityReminder: {
            enabled: draft.inactivityEnabled,
            warningDelay: draft.inactivityWarningDelay * 3_600_000,
            closeDelay: draft.inactivityCloseDelay * 3_600_000,
            pingBehavior: draft.inactivityPingBehavior,
          },
        };
        const res = await fetchApi<TicketCategory>(guildId, `tickets/categories/${editCat.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (res.success) {
          toast.success(`Category "${draft.name}" updated`);
          setModalOpen(false);
          fetchCategories();
        } else {
          toast.error(res.error?.message ?? "Failed to update");
        }
      } else {
        const body: Record<string, any> = {
          name: draft.name.trim(),
          description: draft.description.trim(),
          emoji: draft.emoji.trim() || undefined,
          type: draft.type,
          ticketNameFormat: draft.ticketNameFormat,
          createdBy: "dashboard",
          inactivityReminder: {
            enabled: draft.inactivityEnabled,
            warningDelay: draft.inactivityWarningDelay * 3_600_000,
            closeDelay: draft.inactivityCloseDelay * 3_600_000,
            pingBehavior: draft.inactivityPingBehavior,
          },
        };
        if (draft.type === "child" && draft.parentId) {
          body.parentId = draft.parentId;
        }
        if (draft.type === "child" && draft.discordCategoryId) {
          body.discordCategoryId = draft.discordCategoryId;
        }
        const res = await fetchApi<TicketCategory>(guildId, "tickets/categories", {
          method: "POST",
          body: JSON.stringify(body),
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
      const res = await fetchApi(guildId, `tickets/categories/${deleteCat.id}`, { method: "DELETE" });
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading categories…" />
      </div>
    );
  }

  if (error) {
    // Treat API errors (plugin not loaded, not configured, etc.) same as empty state → show wizard
    // Fall through to the setup wizard / categories list below
  }

  // ── Setup Wizard (no categories) ──
  const handleWizardFinish = async () => {
    if (!wizardParent.name.trim() || !wizardParent.description.trim()) {
      toast.error("Parent category name and description are required");
      return;
    }
    if (!wizardChild.name.trim() || !wizardChild.description.trim()) {
      toast.error("Child category name and description are required");
      return;
    }

    setWizardSaving(true);
    try {
      // 1. Create parent
      const parentRes = await fetchApi<TicketCategory>(guildId, "tickets/categories", {
        method: "POST",
        body: JSON.stringify({
          name: wizardParent.name.trim(),
          description: wizardParent.description.trim(),
          emoji: wizardParent.emoji.trim() || undefined,
          type: "parent",
          createdBy: "dashboard",
        }),
      });

      if (!parentRes.success || !parentRes.data) {
        toast.error(parentRes.error?.message ?? "Failed to create parent category");
        setWizardSaving(false);
        return;
      }

      // 2. Create child under parent
      const childBody: Record<string, any> = {
        name: wizardChild.name.trim(),
        description: wizardChild.description.trim(),
        emoji: wizardChild.emoji.trim() || undefined,
        type: "child",
        parentId: parentRes.data.id ?? parentRes.data._id,
        ticketNameFormat: wizardChild.ticketNameFormat,
        createdBy: "dashboard",
      };
      if (wizardChild.discordCategoryId) {
        childBody.discordCategoryId = wizardChild.discordCategoryId;
      }

      const childRes = await fetchApi<TicketCategory>(guildId, "tickets/categories", {
        method: "POST",
        body: JSON.stringify(childBody),
      });

      if (!childRes.success) {
        toast.error(childRes.error?.message ?? "Failed to create child category");
        setWizardSaving(false);
        return;
      }

      toast.success("Ticket system configured! You can now create openers.");
      setWizardStep(0);
      fetchCategories();
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setWizardSaving(false);
    }
  };

  if (categories.length === 0 && !loading) {
    const steps = [
      { label: "Welcome", icon: "👋" },
      { label: "Parent Category", icon: "📂" },
      { label: "Ticket Category", icon: "🎫" },
      { label: "Review", icon: "✅" },
    ];

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                onClick={() => i < wizardStep && setWizardStep(i)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  i === wizardStep ? "bg-primary-600 text-white" : i < wizardStep ? "bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 cursor-pointer" : "bg-white/5 text-zinc-500"
                }`}>
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < steps.length - 1 && <div className={`h-px w-6 ${i < wizardStep ? "bg-primary-600" : "bg-zinc-700"}`} />}
            </div>
          ))}
        </div>

        {/* Step 0 — Welcome */}
        {wizardStep === 0 && (
          <Card className="text-center">
            <div className="flex flex-col items-center py-4">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600/10 text-3xl">🎫</div>
              <CardTitle className="text-xl">Set Up Ticket Categories</CardTitle>
              <CardDescription className="mt-3 max-w-md">
                Tickets are organized into <strong className="text-zinc-200">parent categories</strong> (groups) and <strong className="text-zinc-200">child categories</strong> (actual ticket types).
                Let's create your first ones.
              </CardDescription>
              <button
                onClick={() => setWizardStep(1)}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
                Get Started
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </Card>
        )}

        {/* Step 1 — Parent Category */}
        {wizardStep === 1 && (
          <Card>
            <CardTitle>Create a Parent Category</CardTitle>
            <CardDescription className="mt-1">A parent category groups related ticket types together (e.g. "Support", "Reports", "Applications").</CardDescription>
            <div className="mt-5 space-y-4">
              <TextInput label="Name" value={wizardParent.name} onChange={(v) => setWizardParent((d) => ({ ...d, name: v }))} placeholder="Support" />
              <Textarea
                label="Description"
                value={wizardParent.description}
                onChange={(v) => setWizardParent((d) => ({ ...d, description: v }))}
                placeholder="All support-related ticket categories"
                rows={2}
              />
              <TextInput label="Emoji" description="Optional" value={wizardParent.emoji} onChange={(v) => setWizardParent((d) => ({ ...d, emoji: v }))} placeholder="📂" />
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => setWizardStep(0)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                Back
              </button>
              <button
                onClick={() => setWizardStep(2)}
                disabled={!wizardParent.name.trim() || !wizardParent.description.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
                Next
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </Card>
        )}

        {/* Step 2 — Child Category */}
        {wizardStep === 2 && (
          <Card>
            <CardTitle>Create a Ticket Category</CardTitle>
            <CardDescription className="mt-1">This is the actual ticket type users will open. It will be nested under "{wizardParent.name || "your parent"}".</CardDescription>
            <div className="mt-5 space-y-4">
              <TextInput label="Name" value={wizardChild.name} onChange={(v) => setWizardChild((d) => ({ ...d, name: v }))} placeholder="General Support" />
              <Textarea
                label="Description"
                value={wizardChild.description}
                onChange={(v) => setWizardChild((d) => ({ ...d, description: v }))}
                placeholder="For general support questions and help"
                rows={2}
              />
              <TextInput label="Emoji" description="Optional" value={wizardChild.emoji} onChange={(v) => setWizardChild((d) => ({ ...d, emoji: v }))} placeholder="🎫" />
              <ChannelCombobox
                guildId={guildId}
                value={wizardChild.discordCategoryId}
                onChange={(v) => setWizardChild((d) => ({ ...d, discordCategoryId: v }))}
                channelType="category"
                label="Discord Category"
                description="The Discord category where ticket channels will be created"
              />
              <TextInput
                label="Ticket Name Format"
                description="Variables: {number}, {openerusername}, {openerdisplayname}"
                value={wizardChild.ticketNameFormat}
                onChange={(v) => setWizardChild((d) => ({ ...d, ticketNameFormat: v }))}
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => setWizardStep(1)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                Back
              </button>
              <button
                onClick={() => setWizardStep(3)}
                disabled={!wizardChild.name.trim() || !wizardChild.description.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
                Next
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </Card>
        )}

        {/* Step 3 — Review */}
        {wizardStep === 3 && (
          <Card>
            <CardTitle>Review & Create</CardTitle>
            <CardDescription className="mt-1">Here's what will be created. You can add more categories later.</CardDescription>

            <div className="mt-5 space-y-3">
              {/* Parent preview */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center gap-2">
                  {wizardParent.emoji && <span className="text-lg">{wizardParent.emoji}</span>}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-200">{wizardParent.name}</p>
                      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">Parent</span>
                    </div>
                    <p className="text-xs text-zinc-500">{wizardParent.description}</p>
                  </div>
                </div>

                {/* Child preview nested */}
                <div className="ml-4 mt-3 border-l-2 border-zinc-700/30 pl-4">
                  <div className="flex items-center gap-2">
                    {wizardChild.emoji && <span>{wizardChild.emoji}</span>}
                    <div>
                      <p className="text-sm text-zinc-300">{wizardChild.name}</p>
                      <p className="text-xs text-zinc-500">{wizardChild.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <button onClick={() => setWizardStep(2)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                Back
              </button>
              <button
                onClick={handleWizardFinish}
                disabled={wizardSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {wizardSaving ? (
                  <>
                    <Spinner size="h-4 w-4" />
                    Creating…
                  </>
                ) : (
                  <>
                    Create Categories
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-zinc-100">Ticket Categories</h3>
          <p className="text-sm text-zinc-500">Parent categories group children. Each child category creates tickets in a Discord channel category.</p>
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

      {categories.length === 0 ? null : (
        <div className="space-y-4">
          {/* Parent categories with their children */}
          {parents.map((parent) => {
            const childCats = children.filter((c) => c.parentId === parent.id);
            return (
              <Card key={parent.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {parent.emoji && <span className="text-lg">{parent.emoji}</span>}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-200">{parent.name}</p>
                        <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">Parent</span>
                        {!parent.isActive && <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500">Inactive</span>}
                      </div>
                      <p className="text-xs text-zinc-500">{parent.description}</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(parent)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200" title="Edit">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button onClick={() => setDeleteCat(parent)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400" title="Delete">
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

                {childCats.length > 0 && (
                  <CardContent className="mt-3">
                    <div className="ml-4 space-y-2 border-l-2 border-zinc-700/30 pl-4">
                      {childCats.map((child) => (
                        <div key={child.id} className="flex items-center justify-between group">
                          <div className="flex items-center gap-2">
                            {child.emoji && <span>{child.emoji}</span>}
                            <span className="text-sm text-zinc-300">{child.name}</span>
                            {!child.isActive && <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500">Inactive</span>}
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => openEditModal(child)} className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
                                Edit
                              </button>
                              <button onClick={() => setDeleteCat(child)} className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10">
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Orphan children (no parent) */}
          {children
            .filter((c) => !c.parentId || !parents.find((p) => p.id === c.parentId))
            .map((child) => (
              <Card key={child.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {child.emoji && <span>{child.emoji}</span>}
                    <p className="text-sm text-zinc-200">{child.name}</p>
                    <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500">No parent</span>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(child)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button onClick={() => setDeleteCat(child)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400">
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

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editCat ? `Edit: ${editCat.name}` : "New Category"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={modalSaving || !draft.name.trim() || !draft.description.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {modalSaving ? (editCat ? "Updating…" : "Creating…") : editCat ? "Update" : "Create"}
            </button>
          </>
        }>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <TextInput label="Name" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="General Support" />
          <Textarea label="Description" value={draft.description} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} placeholder="For general support questions" rows={3} />
          <TextInput label="Emoji" description="Optional emoji" value={draft.emoji} onChange={(v) => setDraft((d) => ({ ...d, emoji: v }))} placeholder="🎫" />

          {!editCat && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">Type</label>
              <select
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as "parent" | "child" }))}
                className="w-full rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-3 py-2 text-sm text-zinc-200 outline-none focus:border-primary-500">
                <option value="parent">Parent</option>
                <option value="child">Child</option>
              </select>
            </div>
          )}

          {((!editCat && draft.type === "child") || (editCat && editCat.type === "child")) && !editCat && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">Parent Category</label>
                <select
                  value={draft.parentId}
                  onChange={(e) => setDraft((d) => ({ ...d, parentId: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-3 py-2 text-sm text-zinc-200 outline-none focus:border-primary-500">
                  <option value="">None</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <ChannelCombobox
                guildId={guildId}
                value={draft.discordCategoryId}
                onChange={(v) => setDraft((d) => ({ ...d, discordCategoryId: v }))}
                channelType="category"
                label="Discord Category"
                description="The Discord server category where ticket channels will be created"
              />
            </>
          )}

          <TextInput
            label="Ticket Name Format"
            description="Variables: {number}, {openerusername}, {openerdisplayname}"
            value={draft.ticketNameFormat}
            onChange={(v) => setDraft((d) => ({ ...d, ticketNameFormat: v }))}
          />

          {editCat && <Toggle label="Active" checked={draft.isActive} onChange={(v) => setDraft((d) => ({ ...d, isActive: v }))} />}

          {/* Inactivity reminder */}
          <div className="rounded-lg border border-zinc-700/30 p-3 space-y-3">
            <Toggle
              label="Inactivity Reminder"
              description="Warn and auto-close inactive tickets"
              checked={draft.inactivityEnabled}
              onChange={(v) => setDraft((d) => ({ ...d, inactivityEnabled: v }))}
            />
            {draft.inactivityEnabled && (
              <>
                <NumberInput label="Warning Delay (hours)" value={draft.inactivityWarningDelay} onChange={(v) => setDraft((d) => ({ ...d, inactivityWarningDelay: v }))} min={1} max={720} />
                <NumberInput label="Close Delay (hours)" value={draft.inactivityCloseDelay} onChange={(v) => setDraft((d) => ({ ...d, inactivityCloseDelay: v }))} min={1} max={720} />
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-300">Ping Behavior</label>
                  <select
                    value={draft.inactivityPingBehavior}
                    onChange={(e) => setDraft((d) => ({ ...d, inactivityPingBehavior: e.target.value as any }))}
                    className="w-full rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-3 py-2 text-sm text-zinc-200 outline-none focus:border-primary-500">
                    <option value="opener">Ping ticket opener</option>
                    <option value="all">Ping all participants</option>
                    <option value="none">No ping</option>
                  </select>
                </div>
              </>
            )}
          </div>
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
          ? This cannot be undone. Existing tickets will remain but new tickets won't use this category.
        </p>
      </Modal>
    </div>
  );
}
