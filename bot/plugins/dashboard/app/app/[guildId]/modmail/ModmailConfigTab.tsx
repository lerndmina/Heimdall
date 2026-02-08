/**
 * ModmailConfigTab — setup wizard + inline edit for modmail global settings.
 *
 * API:
 *   GET /modmail/config → config | 404 MODMAIL_NOT_CONFIGURED
 *   PUT /modmail/config → upserts config
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import NumberInput from "@/components/ui/NumberInput";
import TextInput from "@/components/ui/TextInput";
import Toggle from "@/components/ui/Toggle";
import SetupWizard, { NotConfigured, EditButton, FieldDisplay, ReviewSection, ReviewRow, type WizardStep } from "@/components/ui/SetupWizard";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface ModmailConfig {
  guildId: string;
  enabled: boolean;
  threadNamingPattern: string;
  minimumMessageLength: number;
  globalStaffRoleIds: string[];
  autoCloseHours: number;
  autoCloseWarningHours: number;
  rateLimitSeconds: number;
  allowAttachments: boolean;
  maxAttachmentSizeMB: number;
  trackUserActivity: boolean;
  trackStaffActivity: boolean;
  defaultCategoryId?: string;
  categories: {
    id: string;
    name: string;
    description?: string;
    emoji?: string;
    enabled: boolean;
    priority: number;
    staffRoleIds: string[];
  }[];
}

interface Draft {
  enabled: boolean;
  threadNamingPattern: string;
  minimumMessageLength: number;
  autoCloseHours: number;
  autoCloseWarningHours: number;
  rateLimitSeconds: number;
  allowAttachments: boolean;
  maxAttachmentSizeMB: number;
  trackUserActivity: boolean;
  trackStaffActivity: boolean;
}

const DEFAULT_DRAFT: Draft = {
  enabled: true,
  threadNamingPattern: "#{number} | {username} | {claimer}",
  minimumMessageLength: 50,
  autoCloseHours: 72,
  autoCloseWarningHours: 12,
  rateLimitSeconds: 5,
  allowAttachments: true,
  maxAttachmentSizeMB: 25,
  trackUserActivity: true,
  trackStaffActivity: true,
};

// ── Component ────────────────────────────────────────────

export default function ModmailConfigTab({ guildId }: { guildId: string }) {
  const { permissions, isOwner } = usePermissions();
  const canManage = isOwner || permissions["modmail.manage_config"] === true;

  const [config, setConfig] = useState<ModmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wizard / edit
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ ...DEFAULT_DRAFT });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Fetch ──
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetchApi<ModmailConfig>(guildId, "modmail/config", { skipCache: true });
      if (res.success && res.data) {
        setConfig(res.data);
      } else if (res.error?.code === "MODMAIL_NOT_CONFIGURED" || res.error?.code === "NOT_FOUND") {
        setNotFound(true);
      } else {
        setError(res.error?.message ?? "Failed to load config");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ── Save (upsert) ──
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetchApi<ModmailConfig>(guildId, "modmail/config", {
        method: "PUT",
        body: JSON.stringify(draft),
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
      enabled: config.enabled,
      threadNamingPattern: config.threadNamingPattern,
      minimumMessageLength: config.minimumMessageLength,
      autoCloseHours: config.autoCloseHours,
      autoCloseWarningHours: config.autoCloseWarningHours,
      rateLimitSeconds: config.rateLimitSeconds,
      allowAttachments: config.allowAttachments,
      maxAttachmentSizeMB: config.maxAttachmentSizeMB,
      trackUserActivity: config.trackUserActivity,
      trackStaffActivity: config.trackStaffActivity,
    });
    setWizardStep(0);
    setSaveError(null);
    setWizardOpen(true);
  };

  // ====== Loading ======
  if (loading) {
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
        id: "general",
        label: "General",
        content: <StepGeneral draft={draft} update={update} />,
        validate: () => draft.threadNamingPattern.trim() !== "" && draft.minimumMessageLength >= 1,
      },
      {
        id: "autoclose",
        label: "Auto-Close",
        content: <StepAutoClose draft={draft} update={update} />,
        validate: () => draft.autoCloseHours >= 1 && draft.autoCloseWarningHours >= 1 && draft.autoCloseWarningHours < draft.autoCloseHours,
      },
      {
        id: "attachments",
        label: "Attachments & Tracking",
        content: <StepAttachments draft={draft} update={update} />,
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
        title="Modmail Not Configured"
        description="Set up the modmail system to let users privately contact your staff through DMs. Configure threading, auto-close, and attachment settings."
        onSetup={openCreateWizard}
        canSetup={canManage}
      />
    );
  }

  // ====== Read-only config display ======
  return (
    <div className="space-y-6">
      {/* General Settings */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>General</CardTitle>
          <StatusBadge variant={config.enabled ? "success" : "neutral"}>{config.enabled ? "Enabled" : "Disabled"}</StatusBadge>
        </div>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Thread Naming" value={config.threadNamingPattern} />
            <FieldDisplay label="Min Message Length" value={`${config.minimumMessageLength} characters`} />
            <FieldDisplay label="Rate Limit" value={`${config.rateLimitSeconds} seconds`} />
          </div>
        </CardContent>
      </Card>

      {/* Auto-Close */}
      <Card>
        <CardTitle>Auto-Close</CardTitle>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Inactivity Timeout" value={formatHours(config.autoCloseHours)} />
            <FieldDisplay label="Warning Before Close" value={formatHours(config.autoCloseWarningHours)} />
          </div>
        </CardContent>
      </Card>

      {/* Attachments & Tracking */}
      <Card>
        <CardTitle>Attachments & Tracking</CardTitle>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Attachments" value={config.allowAttachments ? `Allowed (max ${config.maxAttachmentSizeMB} MB)` : "Disabled"} />
            <FieldDisplay label="Track User Activity" value={config.trackUserActivity ? "Yes" : "No"} />
            <FieldDisplay label="Track Staff Activity" value={config.trackStaffActivity ? "Yes" : "No"} />
          </div>
        </CardContent>
      </Card>

      {/* Categories (read-only) */}
      {config.categories && config.categories.length > 0 && (
        <Card>
          <CardTitle>Categories</CardTitle>
          <CardDescription className="mt-1">Modmail categories are managed via Discord commands.</CardDescription>
          <CardContent className="mt-3">
            <div className="divide-y divide-zinc-800">
              {config.categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    {cat.emoji && <span>{cat.emoji}</span>}
                    <span className="text-sm text-zinc-200">{cat.name}</span>
                    {!cat.enabled && <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">Disabled</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>Priority {cat.priority}</span>
                    <span>
                      {cat.staffRoleIds.length} staff role{cat.staffRoleIds.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit button */}
      {canManage && <EditButton onClick={openEditWizard} />}
    </div>
  );
}

// ===========================================================================
// Wizard steps
// ===========================================================================

type UpdateFn = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

function StepGeneral({ draft, update }: { draft: Draft; update: UpdateFn }) {
  return (
    <div className="space-y-5">
      <Toggle label="Enable Modmail" description="Enable or disable the modmail system globally" checked={draft.enabled} onChange={(v) => update("enabled", v)} />
      <TextInput
        label="Thread Naming Pattern"
        description="Template for forum thread names. Variables: {number}, {username}, {claimer}"
        value={draft.threadNamingPattern}
        onChange={(v) => update("threadNamingPattern", v)}
      />
      <NumberInput
        label="Minimum Message Length"
        description="Minimum characters required for user messages (1–4000)"
        value={draft.minimumMessageLength}
        onChange={(v) => update("minimumMessageLength", v)}
        min={1}
        max={4000}
      />
      <NumberInput
        label="Rate Limit (seconds)"
        description="Cooldown between user messages to prevent spam (1–60)"
        value={draft.rateLimitSeconds}
        onChange={(v) => update("rateLimitSeconds", v)}
        min={1}
        max={60}
      />
    </div>
  );
}

function StepAutoClose({ draft, update }: { draft: Draft; update: UpdateFn }) {
  return (
    <div className="space-y-5">
      <NumberInput
        label="Auto-Close Hours"
        description="Close conversations after this many hours of inactivity (1–720)"
        value={draft.autoCloseHours}
        onChange={(v) => update("autoCloseHours", v)}
        min={1}
        max={720}
      />
      {draft.autoCloseHours > 0 && <p className="text-xs text-zinc-500">{formatHours(draft.autoCloseHours)}</p>}

      <NumberInput
        label="Warning Hours Before Close"
        description="Send a warning this many hours before auto-closing (1–168)"
        value={draft.autoCloseWarningHours}
        onChange={(v) => update("autoCloseWarningHours", v)}
        min={1}
        max={168}
      />
      {draft.autoCloseWarningHours > 0 && <p className="text-xs text-zinc-500">{formatHours(draft.autoCloseWarningHours)}</p>}

      {draft.autoCloseWarningHours >= draft.autoCloseHours && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">Warning time must be less than the auto-close time.</div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3 text-xs text-zinc-400">
        Users will receive a warning message when their conversation is about to be auto-closed due to inactivity.
      </div>
    </div>
  );
}

function StepAttachments({ draft, update }: { draft: Draft; update: UpdateFn }) {
  return (
    <div className="space-y-5">
      <Toggle label="Allow Attachments" description="Let users send images and files in modmail conversations" checked={draft.allowAttachments} onChange={(v) => update("allowAttachments", v)} />
      {draft.allowAttachments && (
        <NumberInput
          label="Max Attachment Size (MB)"
          description="Maximum file size in megabytes (1–100)"
          value={draft.maxAttachmentSizeMB}
          onChange={(v) => update("maxAttachmentSizeMB", v)}
          min={1}
          max={100}
        />
      )}
      <div className="border-t border-zinc-800 pt-5">
        <Toggle label="Track User Activity" description="Track when users are last active in conversations" checked={draft.trackUserActivity} onChange={(v) => update("trackUserActivity", v)} />
      </div>
      <Toggle label="Track Staff Activity" description="Track when staff last respond in conversations" checked={draft.trackStaffActivity} onChange={(v) => update("trackStaffActivity", v)} />
    </div>
  );
}

function StepReview({ draft }: { draft: Draft }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Review your modmail settings before saving.</p>

      <ReviewSection title="General">
        <ReviewRow label="Enabled" value={draft.enabled ? "Yes" : "No"} />
        <ReviewRow label="Thread Naming" value={draft.threadNamingPattern} />
        <ReviewRow label="Min Message Length" value={`${draft.minimumMessageLength} chars`} />
        <ReviewRow label="Rate Limit" value={`${draft.rateLimitSeconds}s`} />
      </ReviewSection>

      <ReviewSection title="Auto-Close">
        <ReviewRow label="Inactivity Timeout" value={formatHours(draft.autoCloseHours)} />
        <ReviewRow label="Warning Before Close" value={formatHours(draft.autoCloseWarningHours)} />
      </ReviewSection>

      <ReviewSection title="Attachments & Tracking">
        <ReviewRow label="Attachments" value={draft.allowAttachments ? `Allowed (max ${draft.maxAttachmentSizeMB} MB)` : "Disabled"} />
        <ReviewRow label="Track User Activity" value={draft.trackUserActivity ? "Yes" : "No"} />
        <ReviewRow label="Track Staff Activity" value={draft.trackStaffActivity ? "Yes" : "No"} />
      </ReviewSection>
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function formatHours(hours: number): string {
  if (hours >= 24) {
    const days = hours / 24;
    return days === Math.floor(days) ? `${days} day${days !== 1 ? "s" : ""}` : `${days.toFixed(1)} days`;
  }
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}
