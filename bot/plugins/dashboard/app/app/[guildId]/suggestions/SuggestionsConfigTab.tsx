/**
 * SuggestionsConfigTab — setup wizard + read-only view + edit,
 * following the same pattern as the Minecraft ConfigTab.
 *
 * API:
 *   GET    /suggestions/config   → config | 404 NOT_FOUND
 *   PUT    /suggestions/config   → upserts config
 *   GET    /suggestions/openers  → SuggestionOpener[]
 *   DELETE /suggestions/openers/:id
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import NumberInput from "@/components/ui/NumberInput";
import Toggle from "@/components/ui/Toggle";
import Modal from "@/components/ui/Modal";
import SetupWizard, { NotConfigured, EditButton, FieldDisplay, ReviewSection, ReviewRow, type WizardStep } from "@/components/ui/SetupWizard";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface ChannelConfig {
  channelId: string;
  mode: "embed" | "forum";
  enableAiTitles: boolean;
  createdBy: string;
}

interface SuggestionConfig {
  guildId: string;
  channels: ChannelConfig[];
  maxChannels: number;
  maxCategories: number;
  enableCategories: boolean;
  voteCooldown: number;
  submissionCooldown: number;
  updatedBy: string;
}

interface SuggestionOpener {
  _id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  description: string;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

interface Draft {
  maxChannels: number;
  maxCategories: number;
  voteCooldown: number;
  submissionCooldown: number;
  enableCategories: boolean;
}

const DEFAULT_DRAFT: Draft = {
  maxChannels: 3,
  maxCategories: 15,
  voteCooldown: 60,
  submissionCooldown: 3600,
  enableCategories: false,
};

// ── Component ────────────────────────────────────────────

export default function SuggestionsConfigTab({ guildId }: { guildId: string }) {
  const canManage = useCanManage("suggestions.manage_config");

  const [config, setConfig] = useState<SuggestionConfig | null>(null);
  const [openers, setOpeners] = useState<SuggestionOpener[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wizard / edit
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete opener
  const [deleteOpener, setDeleteOpener] = useState<SuggestionOpener | null>(null);
  const [deletingOpener, setDeletingOpener] = useState(false);

  // ── Fetch ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [configRes, openersRes] = await Promise.all([
        fetchApi<SuggestionConfig>(guildId, "suggestions/config", { skipCache: true }),
        fetchApi<SuggestionOpener[]>(guildId, "suggestions/openers", { skipCache: true }),
      ]);

      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
      } else if (configRes.error?.code === "NOT_FOUND") {
        setNotFound(true);
      } else {
        setError(configRes.error?.message ?? "Failed to load config");
      }
      if (openersRes.success && openersRes.data) {
        setOpeners(openersRes.data);
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

  useRealtimeEvent("suggestions:updated", () => {
    fetchAll();
  });

  // ── Save (upsert) ──
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetchApi<SuggestionConfig>(guildId, "suggestions/config", {
        method: "PUT",
        body: JSON.stringify({ ...draft, updatedBy: "dashboard" }),
      });
      if (res.success && res.data) {
        setConfig(res.data);
        setNotFound(false);
        setWizardOpen(false);
        setWizardStep(0);
        toast.success("Configuration saved");
      } else {
        setSaveError(res.error?.message ?? "Failed to save");
      }
    } catch {
      setSaveError("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  };

  // ── Open wizard for create ──
  const openCreateWizard = () => {
    setDraft({ ...DEFAULT_DRAFT });
    setWizardStep(0);
    setSaveError(null);
    setWizardOpen(true);
  };

  // ── Open wizard for edit ──
  const openEditWizard = () => {
    if (!config) return;
    setDraft({
      maxChannels: config.maxChannels,
      maxCategories: config.maxCategories ?? 15,
      voteCooldown: config.voteCooldown,
      submissionCooldown: config.submissionCooldown,
      enableCategories: config.enableCategories,
    });
    setWizardStep(0);
    setSaveError(null);
    setWizardOpen(true);
  };

  // ── Delete opener ──
  const handleDeleteOpener = async () => {
    if (!deleteOpener) return;
    setDeletingOpener(true);
    try {
      const res = await fetchApi(guildId, `suggestions/openers/${deleteOpener._id}`, { method: "DELETE" });
      if (res.success) {
        toast.success("Opener deleted");
        setOpeners((o) => o.filter((op) => op._id !== deleteOpener._id));
        setDeleteOpener(null);
      } else {
        toast.error(res.error?.message ?? "Failed to delete opener");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeletingOpener(false);
    }
  };

  // ====== Loading ======
  if (loading && !wizardOpen && !config && !notFound) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading configuration…" />
      </div>
    );
  }

  // ====== Error ======
  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // ====== Wizard overlay ======
  if (wizardOpen) {
    const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

    const wizardSteps: WizardStep[] = [
      {
        id: "limits",
        label: "Limits",
        content: <StepLimits draft={draft} update={update} />,
        validate: () => draft.maxChannels >= 1 && draft.maxChannels <= 10 && draft.maxCategories >= 1 && draft.maxCategories <= 25,
      },
      {
        id: "cooldowns",
        label: "Cooldowns",
        content: <StepCooldowns draft={draft} update={update} />,
        validate: () => draft.voteCooldown >= 10 && draft.voteCooldown <= 300 && draft.submissionCooldown >= 60 && draft.submissionCooldown <= 7200,
      },
      {
        id: "review",
        label: "Review",
        content: <StepReview draft={draft} />,
      },
    ];

    return (
      <SetupWizard
        steps={wizardSteps}
        step={wizardStep}
        onStepChange={setWizardStep}
        isEdit={!notFound && !!config}
        saving={saving}
        saveError={saveError}
        onSave={handleSave}
        onCancel={() => setWizardOpen(false)}
      />
    );
  }

  // ====== No config — create prompt ======
  if (notFound || !config) {
    return (
      <NotConfigured
        title="No Suggestion Configuration"
        description="Set up the suggestion system to let your community submit, vote on, and track ideas."
        onSetup={openCreateWizard}
        canSetup={canManage}
      />
    );
  }

  // ====== Read-only config display ======
  return (
    <div className="space-y-6">
      {/* Global Settings */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Global Settings</CardTitle>
          <StatusBadge variant={config.enableCategories ? "success" : "neutral"}>{config.enableCategories ? "Categories On" : "Categories Off"}</StatusBadge>
        </div>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Max Channels" value={String(config.maxChannels)} />
            <FieldDisplay label="Max Categories" value={String(config.maxCategories ?? 15)} />
            <FieldDisplay label="Vote Cooldown" value={formatDuration(config.voteCooldown)} />
            <FieldDisplay label="Submission Cooldown" value={formatDuration(config.submissionCooldown)} />
          </div>
        </CardContent>
      </Card>

      {/* Configured channels (read-only) */}
      {config.channels.length > 0 && (
        <Card>
          <CardTitle>Configured Channels</CardTitle>
          <CardDescription className="mt-1">Suggestion channels are managed via Discord commands.</CardDescription>
          <CardContent className="mt-3">
            <div className="divide-y divide-zinc-700/30">
              {config.channels.map((ch) => (
                <div key={ch.channelId} className="flex items-center justify-between py-3">
                  <span className="text-sm text-zinc-300">{ch.channelId}</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-zinc-400 capitalize">{ch.mode}</span>
                    {ch.enableAiTitles && <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">AI Titles</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Openers */}
      <Card>
        <CardTitle>Suggestion Openers</CardTitle>
        <CardDescription className="mt-1">Opener messages deployed in Discord channels. Manage via Discord commands; you can delete them here.</CardDescription>
        <CardContent className="mt-3">
          {openers.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No openers deployed</p>
          ) : (
            <div className="divide-y divide-zinc-700/30">
              {openers.map((op) => (
                <div key={op._id} className="flex items-center justify-between py-3 group">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{op.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">{op.description}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      Channel: {op.channelId} · {op.enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  {canManage && (
                    <button onClick={() => setDeleteOpener(op)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 opacity-0 transition hover:bg-red-500/10 group-hover:opacity-100">
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit button */}
      {canManage && <EditButton onClick={openEditWizard} />}

      {/* Delete opener modal */}
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
              onClick={handleDeleteOpener}
              disabled={deletingOpener}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deletingOpener ? "Deleting…" : "Delete"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">
          Delete the opener <span className="font-medium text-zinc-200">{deleteOpener?.title}</span>? The message will be removed from Discord as well.
        </p>
      </Modal>
    </div>
  );
}

// ===========================================================================
// Wizard steps
// ===========================================================================

type UpdateFn = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

function StepLimits({ draft, update }: { draft: Draft; update: UpdateFn }) {
  return (
    <div className="space-y-5">
      <NumberInput
        label="Max Channels"
        description="Maximum number of suggestion channels that can be configured (1–10)"
        value={draft.maxChannels}
        onChange={(v) => update("maxChannels", v)}
        min={1}
        max={10}
      />
      <NumberInput
        label="Max Categories"
        description="Maximum number of suggestion categories allowed (1–25)"
        value={draft.maxCategories}
        onChange={(v) => update("maxCategories", v)}
        min={1}
        max={25}
      />
      <div className="border-t border-zinc-700/30 pt-5">
        <Toggle
          label="Enable Categories"
          description="Allow organizing suggestions into named categories for easier management"
          checked={draft.enableCategories}
          onChange={(v) => update("enableCategories", v)}
        />
      </div>
      {!draft.enableCategories && (
        <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-4 py-3 text-xs text-zinc-400">
          You can enable categories later. When off, all suggestions go into a single pool.
        </div>
      )}
    </div>
  );
}

function StepCooldowns({ draft, update }: { draft: Draft; update: UpdateFn }) {
  return (
    <div className="space-y-5">
      <NumberInput
        label="Vote Cooldown (seconds)"
        description="Minimum time between votes by the same user (10–300)"
        value={draft.voteCooldown}
        onChange={(v) => update("voteCooldown", v)}
        min={10}
        max={300}
      />
      {draft.voteCooldown > 0 && <p className="text-xs text-zinc-500">{draft.voteCooldown >= 60 ? `≈ ${(draft.voteCooldown / 60).toFixed(1)} minute(s)` : `${draft.voteCooldown} seconds`}</p>}

      <NumberInput
        label="Submission Cooldown (seconds)"
        description="Minimum time between suggestion submissions by the same user (60–7200)"
        value={draft.submissionCooldown}
        onChange={(v) => update("submissionCooldown", v)}
        min={60}
        max={7200}
      />
      {draft.submissionCooldown > 0 && (
        <p className="text-xs text-zinc-500">
          {draft.submissionCooldown >= 3600
            ? `≈ ${(draft.submissionCooldown / 3600).toFixed(1)} hour(s)`
            : draft.submissionCooldown >= 60
              ? `≈ ${(draft.submissionCooldown / 60).toFixed(1)} minute(s)`
              : `${draft.submissionCooldown} seconds`}
        </p>
      )}

      <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-4 py-3 text-xs text-zinc-400">
        These cooldowns prevent spam while still allowing active participation. You can adjust them later via the edit wizard.
      </div>
    </div>
  );
}

function StepReview({ draft }: { draft: Draft }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Review your settings before saving.</p>

      <ReviewSection title="Limits">
        <ReviewRow label="Max Channels" value={String(draft.maxChannels)} />
        <ReviewRow label="Max Categories" value={String(draft.maxCategories)} />
        <ReviewRow label="Categories" value={draft.enableCategories ? "Enabled" : "Disabled"} />
      </ReviewSection>

      <ReviewSection title="Cooldowns">
        <ReviewRow label="Vote Cooldown" value={formatDuration(draft.voteCooldown)} />
        <ReviewRow label="Submission Cooldown" value={formatDuration(draft.submissionCooldown)} />
      </ReviewSection>
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

// ReviewSection, ReviewRow, FieldDisplay imported from @/components/ui/SetupWizard

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} hour(s)`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(0)} minute(s)`;
  return `${seconds}s`;
}
