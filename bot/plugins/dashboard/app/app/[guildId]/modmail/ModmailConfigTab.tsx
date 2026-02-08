/**
 * ModmailConfigTab — view/edit modmail global settings.
 *
 * API:
 *   GET /modmail/config → config (safe, no encrypted fields)
 *   PUT /modmail/config { ... partial update fields }
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import NumberInput from "@/components/ui/NumberInput";
import TextInput from "@/components/ui/TextInput";
import Toggle from "@/components/ui/Toggle";
import { NotConfigured } from "@/components/ui/SetupWizard";
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

// ── Component ────────────────────────────────────────────

export default function ModmailConfigTab({ guildId }: { guildId: string }) {
  const { permissions, isOwner } = usePermissions();
  const canManage = isOwner || permissions["modmail.manage_config"] === true;

  const [config, setConfig] = useState<ModmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft for editable fields
  const [draft, setDraft] = useState({
    enabled: true,
    threadNamingPattern: "",
    minimumMessageLength: 50,
    autoCloseHours: 72,
    autoCloseWarningHours: 12,
    rateLimitSeconds: 5,
    allowAttachments: true,
    maxAttachmentSizeMB: 25,
    trackUserActivity: true,
    trackStaffActivity: true,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Fetch ──
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetchApi<ModmailConfig>(guildId, "modmail/config", { skipCache: true });
      if (res.success && res.data) {
        setConfig(res.data);
        setDraft({
          enabled: res.data.enabled,
          threadNamingPattern: res.data.threadNamingPattern,
          minimumMessageLength: res.data.minimumMessageLength,
          autoCloseHours: res.data.autoCloseHours,
          autoCloseWarningHours: res.data.autoCloseWarningHours,
          rateLimitSeconds: res.data.rateLimitSeconds,
          allowAttachments: res.data.allowAttachments,
          maxAttachmentSizeMB: res.data.maxAttachmentSizeMB,
          trackUserActivity: res.data.trackUserActivity,
          trackStaffActivity: res.data.trackStaffActivity,
        });
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

  // ── Save ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetchApi<ModmailConfig>(guildId, "modmail/config", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      if (res.success && res.data) {
        setConfig(res.data);
        setDirty(false);
        toast.success("Configuration saved");
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading configuration…" />
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

  if (notFound || !config) {
    return (
      <NotConfigured
        title="Modmail Not Configured"
        description="Run the modmail setup command in Discord to create the initial configuration. Once set up, you can manage settings here."
        canSetup={false}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* General settings */}
      <Card>
        <CardTitle>General</CardTitle>
        <CardContent className="mt-4 space-y-4">
          <Toggle label="Enabled" description="Enable or disable the modmail system" checked={draft.enabled} onChange={(v) => update("enabled", v)} disabled={!canManage} />
          <TextInput
            label="Thread Naming Pattern"
            description="Template for forum thread names. Variables: {number}, {username}, {claimer}"
            value={draft.threadNamingPattern}
            onChange={(v) => update("threadNamingPattern", v)}
            disabled={!canManage}
          />
          <NumberInput
            label="Minimum Message Length"
            description="Minimum characters required for user messages"
            value={draft.minimumMessageLength}
            onChange={(v) => update("minimumMessageLength", v)}
            min={0}
            max={500}
            disabled={!canManage}
          />
          <NumberInput
            label="Rate Limit (seconds)"
            description="Cooldown between user messages"
            value={draft.rateLimitSeconds}
            onChange={(v) => update("rateLimitSeconds", v)}
            min={1}
            max={60}
            disabled={!canManage}
          />
        </CardContent>
      </Card>

      {/* Auto-close settings */}
      <Card>
        <CardTitle>Auto-Close</CardTitle>
        <CardContent className="mt-4 space-y-4">
          <NumberInput
            label="Auto-Close Hours"
            description="Close conversations after this many hours of inactivity"
            value={draft.autoCloseHours}
            onChange={(v) => update("autoCloseHours", v)}
            min={1}
            max={720}
            disabled={!canManage}
          />
          <NumberInput
            label="Warning Hours Before Close"
            description="Send a warning this many hours before auto-closing"
            value={draft.autoCloseWarningHours}
            onChange={(v) => update("autoCloseWarningHours", v)}
            min={1}
            max={168}
            disabled={!canManage}
          />
        </CardContent>
      </Card>

      {/* Attachments & Tracking */}
      <Card>
        <CardTitle>Attachments & Tracking</CardTitle>
        <CardContent className="mt-4 space-y-4">
          <Toggle
            label="Allow Attachments"
            description="Let users send attachments in modmail"
            checked={draft.allowAttachments}
            onChange={(v) => update("allowAttachments", v)}
            disabled={!canManage}
          />
          {draft.allowAttachments && (
            <NumberInput label="Max Attachment Size (MB)" value={draft.maxAttachmentSizeMB} onChange={(v) => update("maxAttachmentSizeMB", v)} min={1} max={100} disabled={!canManage} />
          )}
          <Toggle
            label="Track User Activity"
            description="Track when users are last active in conversations"
            checked={draft.trackUserActivity}
            onChange={(v) => update("trackUserActivity", v)}
            disabled={!canManage}
          />
          <Toggle
            label="Track Staff Activity"
            description="Track when staff last respond in conversations"
            checked={draft.trackStaffActivity}
            onChange={(v) => update("trackStaffActivity", v)}
            disabled={!canManage}
          />
        </CardContent>
      </Card>

      {/* Categories (read-only) */}
      {config && config.categories.length > 0 && (
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

      {/* Dirty bar */}
      {dirty && canManage && (
        <div className="sticky bottom-4 z-40 flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900/95 px-6 py-3 shadow-xl backdrop-blur">
          <p className="text-sm text-zinc-300">You have unsaved changes</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (config) {
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
                  setDirty(false);
                }
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800">
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
