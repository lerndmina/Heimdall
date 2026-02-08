/**
 * AttachmentBlockerPage — Dashboard UI with setup wizard and tabbed management.
 *
 * - Not configured: shows NotConfigured → launches SetupWizard
 * - Configured: Tabs for "Global Settings" and "Channel Overrides"
 * - GIF and Video are separate attachment types
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription, CardHeader } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Toggle from "@/components/ui/Toggle";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import NumberInput from "@/components/ui/NumberInput";
import Tabs from "@/components/ui/Tabs";
import SetupWizard, { NotConfigured, ReviewSection, ReviewRow } from "@/components/ui/SetupWizard";
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

const ATTACHMENT_TYPES = [
  { id: "image", label: "Images", description: "PNG, JPEG, WebP, BMP, etc." },
  { id: "video", label: "Videos", description: "MP4, WebM, MOV, AVI, etc." },
  { id: "gif", label: "GIFs", description: "GIF, APNG, Tenor, Giphy links" },
  { id: "audio", label: "Audio", description: "MP3, WAV, OGG, FLAC, etc." },
] as const;

const SPECIAL_TYPES = [
  { id: "all", label: "All Attachments", description: "Allow everything — no blocking" },
  { id: "none", label: "No Attachments", description: "Block all attachments and media links" },
] as const;

interface GuildConfig {
  guildId: string;
  enabled: boolean;
  defaultAllowedTypes: string[];
  defaultTimeoutDuration: number;
}

interface ChannelOverride {
  _id: string;
  guildId: string;
  channelId: string;
  allowedTypes?: string[];
  timeoutDuration?: number | null;
  enabled: boolean;
  createdBy: string;
}

// ── Component ────────────────────────────────────────────

export default function AttachmentBlockerPage({ guildId }: { guildId: string }) {
  const { permissions, isOwner } = usePermissions();
  const canManage = isOwner || permissions["attachment-blocker.manage_config"] === true;

  const [config, setConfig] = useState<GuildConfig | null>(null);
  const [channels, setChannels] = useState<ChannelOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardTypes, setWizardTypes] = useState<string[]>([]);
  const [wizardTimeout, setWizardTimeout] = useState(0);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Edit state for guild defaults
  const [guildEnabled, setGuildEnabled] = useState(false);
  const [guildAllowedTypes, setGuildAllowedTypes] = useState<string[]>([]);
  const [guildTimeoutSeconds, setGuildTimeoutSeconds] = useState(0);
  const [savingGuild, setSavingGuild] = useState(false);

  // Channel override modal
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelOverride | null>(null);
  const [channelFormId, setChannelFormId] = useState("");
  const [channelFormTypes, setChannelFormTypes] = useState<string[]>([]);
  const [channelFormTimeout, setChannelFormTimeout] = useState<number | undefined>(undefined);
  const [channelFormEnabled, setChannelFormEnabled] = useState(true);
  const [savingChannel, setSavingChannel] = useState(false);

  // Delete modal
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, channelsRes] = await Promise.all([
        fetchApi<GuildConfig>(guildId, "attachment-blocker/config", { skipCache: true }),
        fetchApi<ChannelOverride[]>(guildId, "attachment-blocker/channels", { skipCache: true }),
      ]);

      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
        setGuildEnabled(configRes.data.enabled);
        setGuildAllowedTypes(configRes.data.defaultAllowedTypes);
        setGuildTimeoutSeconds(Math.round(configRes.data.defaultTimeoutDuration / 1000));
      } else {
        setConfig(null);
        setGuildEnabled(false);
        setGuildAllowedTypes([]);
        setGuildTimeoutSeconds(0);
      }

      if (channelsRes.success && channelsRes.data) {
        setChannels(channelsRes.data);
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Guild config dirty check ──
  const isGuildDirty =
    guildEnabled !== (config?.enabled ?? false) ||
    JSON.stringify(guildAllowedTypes.slice().sort()) !== JSON.stringify((config?.defaultAllowedTypes ?? []).slice().sort()) ||
    guildTimeoutSeconds !== Math.round((config?.defaultTimeoutDuration ?? 0) / 1000);

  // ── Save guild config ──
  const saveGuildConfig = async () => {
    setSavingGuild(true);
    try {
      const res = await fetchApi<GuildConfig>(guildId, "attachment-blocker/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: guildEnabled,
          defaultAllowedTypes: guildAllowedTypes,
          defaultTimeoutDuration: guildTimeoutSeconds * 1000,
        }),
      });
      if (res.success && res.data) {
        setConfig(res.data);
        toast.success("Guild defaults updated");
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSavingGuild(false);
    }
  };

  // ── Type toggle handler (generic) ──
  const toggleTypeInList = (list: string[], typeId: string): string[] => {
    if (typeId === "all") return ["all"];
    if (typeId === "none") return ["none"];
    const filtered = list.filter((t) => t !== "all" && t !== "none");
    if (filtered.includes(typeId)) {
      return filtered.filter((t) => t !== typeId);
    }
    return [...filtered, typeId];
  };

  // ── Open add/edit channel modal ──
  const openAddModal = () => {
    setEditingChannel(null);
    setChannelFormId("");
    setChannelFormTypes([]);
    setChannelFormTimeout(undefined);
    setChannelFormEnabled(true);
    setShowAddChannel(true);
  };

  const openEditModal = (ch: ChannelOverride) => {
    setEditingChannel(ch);
    setChannelFormId(ch.channelId);
    setChannelFormTypes(ch.allowedTypes ?? []);
    setChannelFormTimeout(ch.timeoutDuration != null ? Math.round(ch.timeoutDuration / 1000) : undefined);
    setChannelFormEnabled(ch.enabled);
    setShowAddChannel(true);
  };

  // ── Save channel override ──
  const saveChannelOverride = async () => {
    const targetChannelId = editingChannel?.channelId ?? channelFormId;
    if (!targetChannelId) {
      toast.error("Please select a channel");
      return;
    }

    setSavingChannel(true);
    try {
      const res = await fetchApi<ChannelOverride>(guildId, `attachment-blocker/channels/${targetChannelId}`, {
        method: "PUT",
        body: JSON.stringify({
          allowedTypes: channelFormTypes.length > 0 ? channelFormTypes : undefined,
          timeoutDuration: channelFormTimeout !== undefined ? channelFormTimeout * 1000 : null,
          enabled: channelFormEnabled,
        }),
      });
      if (res.success && res.data) {
        // Update or add in local state
        setChannels((prev) => {
          const idx = prev.findIndex((c) => c.channelId === targetChannelId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = res.data!;
            return next;
          }
          return [...prev, res.data!];
        });
        setShowAddChannel(false);
        toast.success(editingChannel ? "Channel override updated" : "Channel override added");
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSavingChannel(false);
    }
  };

  // ── Delete channel override ──
  const confirmDeleteChannel = (channelId: string) => {
    setDeletingChannelId(channelId);
    setShowDeleteModal(true);
  };

  const handleDeleteChannel = async () => {
    if (!deletingChannelId) return;
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, `attachment-blocker/channels/${deletingChannelId}`, {
        method: "DELETE",
      });
      if (res.success) {
        setChannels((prev) => prev.filter((c) => c.channelId !== deletingChannelId));
        setShowDeleteModal(false);
        setDeletingChannelId(null);
        toast.success("Channel override deleted");
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  // ── Helper: get type label ──
  const getTypeLabel = (id: string) => [...ATTACHMENT_TYPES, ...SPECIAL_TYPES].find((t) => t.id === id)?.label ?? id;

  // ── Helper: is special type ──
  const isSpecialType = (types: string[]) => types.includes("all") || types.includes("none");

  // ── Wizard save ──
  const handleWizardSave = async () => {
    setWizardSaving(true);
    setWizardError(null);
    try {
      const res = await fetchApi<GuildConfig>(guildId, "attachment-blocker/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          defaultAllowedTypes: wizardTypes,
          defaultTimeoutDuration: wizardTimeout * 1000,
        }),
      });
      if (res.success && res.data) {
        setConfig(res.data);
        setGuildEnabled(res.data.enabled);
        setGuildAllowedTypes(res.data.defaultAllowedTypes);
        setGuildTimeoutSeconds(Math.round(res.data.defaultTimeoutDuration / 1000));
        setShowWizard(false);
        setWizardStep(0);
        toast.success("Attachment Blocker configured!");
      } else {
        setWizardError(res.error?.message ?? "Failed to save configuration");
      }
    } catch {
      setWizardError("Failed to connect to API");
    } finally {
      setWizardSaving(false);
    }
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

  // ====== Setup Wizard ======
  if (showWizard) {
    const wizardSteps = [
      {
        id: "types",
        label: "Allowed Types",
        validate: () => wizardTypes.length > 0,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">What can users post?</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Select which attachment types should be <strong>allowed</strong>. Everything else will be blocked.
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Media Types</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ATTACHMENT_TYPES.map((type) => (
                  <TypeCheckbox
                    key={type.id}
                    type={type}
                    checked={wizardTypes.includes(type.id)}
                    disabled={isSpecialType(wizardTypes)}
                    onChange={() => setWizardTypes(toggleTypeInList(wizardTypes, type.id))}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Presets</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SPECIAL_TYPES.map((type) => (
                  <TypeCheckbox key={type.id} type={type} checked={wizardTypes.includes(type.id)} disabled={false} onChange={() => setWizardTypes(toggleTypeInList(wizardTypes, type.id))} />
                ))}
              </div>
            </div>

            {!isSpecialType(wizardTypes) && wizardTypes.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
                <strong>Tip:</strong> Allowing <strong>Videos</strong> lets users upload video files (MP4, WebM, etc.) while <strong>GIFs</strong> controls animated images and GIF hosting links
                (Tenor, Giphy, etc.). You can allow one without the other.
              </div>
            )}
          </div>
        ),
      },
      {
        id: "timeout",
        label: "Timeout",
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Violation Timeout</h3>
              <p className="mt-1 text-sm text-zinc-400">Optionally timeout users who post disallowed attachments. Set to 0 to disable timeouts.</p>
            </div>
            <div className="max-w-sm">
              <NumberInput label="Timeout (seconds)" value={wizardTimeout} onChange={setWizardTimeout} min={0} max={604800} />
            </div>
            {wizardTimeout > 0 && (
              <p className="text-xs text-zinc-500">
                Users will be timed out for{" "}
                <strong className="text-zinc-300">
                  {wizardTimeout >= 3600
                    ? `${Math.floor(wizardTimeout / 3600)}h ${Math.floor((wizardTimeout % 3600) / 60)}m`
                    : wizardTimeout >= 60
                      ? `${Math.floor(wizardTimeout / 60)}m ${wizardTimeout % 60}s`
                      : `${wizardTimeout}s`}
                </strong>{" "}
                when they violate the rules.
              </p>
            )}
          </div>
        ),
      },
      {
        id: "review",
        label: "Review",
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Review Configuration</h3>
              <p className="mt-1 text-sm text-zinc-400">Confirm your settings before enabling the attachment blocker.</p>
            </div>

            <ReviewSection title="Allowed Types">
              <ReviewRow label="Whitelisted">
                <div className="flex flex-wrap gap-1.5">
                  {wizardTypes.map((t) => (
                    <span key={t} className="rounded-full bg-primary-500/20 px-2 py-0.5 text-xs font-medium text-primary-300">
                      {getTypeLabel(t)}
                    </span>
                  ))}
                </div>
              </ReviewRow>
              {!isSpecialType(wizardTypes) && (
                <ReviewRow label="Blocked">
                  <div className="flex flex-wrap gap-1.5">
                    {ATTACHMENT_TYPES.filter((t) => !wizardTypes.includes(t.id)).map((t) => (
                      <span key={t.id} className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">
                        {t.label}
                      </span>
                    ))}
                  </div>
                </ReviewRow>
              )}
            </ReviewSection>

            <ReviewSection title="Enforcement">
              <ReviewRow label="Timeout" value={wizardTimeout > 0 ? `${wizardTimeout}s` : "Disabled"} />
              <ReviewRow label="Status" value="Enabled" />
            </ReviewSection>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
              The blocker will be enabled immediately. You can add per-channel overrides afterward from the Channel Overrides tab.
            </div>
          </div>
        ),
      },
    ];

    return (
      <SetupWizard
        steps={wizardSteps}
        step={wizardStep}
        onStepChange={setWizardStep}
        isEdit={false}
        saving={wizardSaving}
        saveError={wizardError}
        onSave={handleWizardSave}
        onCancel={() => {
          setShowWizard(false);
          setWizardStep(0);
          setWizardTypes([]);
          setWizardTimeout(0);
        }}
        saveLabel="Enable Attachment Blocker"
        savingLabel="Setting up…"
      />
    );
  }

  // ====== Not Configured ======
  if (!config) {
    return (
      <NotConfigured
        title="Attachment Blocker"
        description="Control what types of attachments and media links users can post. Block GIFs, videos, images, or audio independently — or block everything."
        icon={
          <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        }
        buttonLabel="Set Up Attachment Blocker"
        onSetup={() => setShowWizard(true)}
        canSetup={canManage}
      />
    );
  }

  // ====== Configured — Tabs UI ======
  return (
    <div className="space-y-0">
      <Tabs
        tabs={[
          {
            id: "global",
            label: "Global Settings",
            icon: (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
            content: (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <CardTitle>Global Defaults</CardTitle>
                      <StatusBadge variant={guildEnabled ? "success" : "neutral"}>{guildEnabled ? "Enabled" : "Disabled"}</StatusBadge>
                    </div>
                  </CardHeader>
                  <CardDescription>These rules apply to all channels unless overridden. Configure per-channel exceptions in the Channel Overrides tab.</CardDescription>

                  <CardContent className="mt-4 space-y-5">
                    <Toggle
                      label="Enable Attachment Blocker"
                      description="When enabled, only whitelisted attachment types are allowed"
                      checked={guildEnabled}
                      onChange={setGuildEnabled}
                      disabled={!canManage || savingGuild}
                    />

                    {/* Allowed types — media */}
                    <div>
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Whitelisted Media Types</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {ATTACHMENT_TYPES.map((type) => (
                          <TypeCheckbox
                            key={type.id}
                            type={type}
                            checked={guildAllowedTypes.includes(type.id)}
                            disabled={!canManage || savingGuild || guildAllowedTypes.includes("all") || guildAllowedTypes.includes("none")}
                            onChange={() => setGuildAllowedTypes(toggleTypeInList(guildAllowedTypes, type.id))}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Presets */}
                    <div>
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Presets</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {SPECIAL_TYPES.map((type) => (
                          <TypeCheckbox
                            key={type.id}
                            type={type}
                            checked={guildAllowedTypes.includes(type.id)}
                            disabled={!canManage || savingGuild}
                            onChange={() => setGuildAllowedTypes(toggleTypeInList(guildAllowedTypes, type.id))}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Timeout */}
                    <div>
                      <p className="mb-1 text-sm font-medium text-zinc-200">Timeout Duration</p>
                      <p className="mb-2 text-xs text-zinc-500">Automatically timeout users who violate the rules (0 = no timeout)</p>
                      <div className="max-w-xs">
                        <NumberInput label="Seconds" value={guildTimeoutSeconds} onChange={setGuildTimeoutSeconds} min={0} max={604800} disabled={!canManage || savingGuild} />
                      </div>
                    </div>

                    {/* Save button */}
                    {canManage && isGuildDirty && (
                      <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                        <p className="text-sm text-amber-300">You have unsaved changes</p>
                        <button
                          onClick={saveGuildConfig}
                          disabled={savingGuild}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
                          {savingGuild && <SpinnerIcon />}
                          {savingGuild ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            id: "channels",
            label: "Channel Overrides",
            icon: (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            ),
            content: (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle>Channel Overrides</CardTitle>
                        <StatusBadge variant="neutral">{channels.length} configured</StatusBadge>
                      </div>
                      {canManage && (
                        <button
                          onClick={openAddModal}
                          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/30 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Override
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <CardDescription>Override global defaults for specific channels. Channels without overrides inherit the guild-wide settings.</CardDescription>

                  <CardContent className="mt-4">
                    {channels.length === 0 ? (
                      <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-8 text-center">
                        <svg className="mx-auto mb-3 h-8 w-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                        <p className="text-sm font-medium text-zinc-400">No channel overrides</p>
                        <p className="mt-1 text-xs text-zinc-500">All channels are using the global defaults.</p>
                        {canManage && (
                          <button
                            onClick={openAddModal}
                            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add First Override
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {channels.map((ch) => (
                          <div key={ch.channelId} className="flex items-center justify-between rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-zinc-200">
                                  <span className="text-zinc-500">#</span> {ch.channelId}
                                </span>
                                <StatusBadge variant={ch.enabled ? "success" : "neutral"}>{ch.enabled ? "Active" : "Disabled"}</StatusBadge>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {ch.allowedTypes && ch.allowedTypes.length > 0 ? (
                                  ch.allowedTypes.map((t) => (
                                    <span key={t} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                      {getTypeLabel(t)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-zinc-500 italic">Inherits guild defaults</span>
                                )}
                                {ch.timeoutDuration != null && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">Timeout: {Math.round(ch.timeoutDuration / 1000)}s</span>}
                              </div>
                            </div>
                            {canManage && (
                              <div className="flex items-center gap-2 ml-4">
                                <button onClick={() => openEditModal(ch)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200" title="Edit">
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                </button>
                                <button onClick={() => confirmDeleteChannel(ch.channelId)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400" title="Delete">
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
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          },
        ]}
        defaultTab="global"
      />

      {/* ═══ Add/Edit Channel Override Modal ═══ */}
      <Modal
        open={showAddChannel}
        onClose={() => setShowAddChannel(false)}
        title={editingChannel ? "Edit Channel Override" : "Add Channel Override"}
        footer={
          <>
            <button onClick={() => setShowAddChannel(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={saveChannelOverride}
              disabled={savingChannel || (!editingChannel && !channelFormId)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
              {savingChannel && <SpinnerIcon />}
              {savingChannel ? "Saving…" : editingChannel ? "Update Override" : "Add Override"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {!editingChannel && (
            <ChannelCombobox
              guildId={guildId}
              value={channelFormId}
              onChange={setChannelFormId}
              channelType="text"
              label="Channel"
              description="Select the channel to override rules for"
              disabled={savingChannel}
            />
          )}

          <Toggle label="Enabled" description="Whether attachment blocking is active for this channel" checked={channelFormEnabled} onChange={setChannelFormEnabled} disabled={savingChannel} />

          <div>
            <p className="mb-2 text-sm font-medium text-zinc-200">Whitelisted Types</p>
            <p className="mb-2 text-xs text-zinc-500">Leave empty to inherit guild defaults</p>
            <div className="space-y-1.5">
              {[...ATTACHMENT_TYPES, ...SPECIAL_TYPES].map((type) => (
                <button
                  key={type.id}
                  disabled={savingChannel}
                  onClick={() => setChannelFormTypes(toggleTypeInList(channelFormTypes, type.id))}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    channelFormTypes.includes(type.id) ? "border-primary-500/50 bg-primary-500/10 text-zinc-100" : "border-zinc-700/30 bg-white/5 text-zinc-400 hover:border-zinc-600/40"
                  } disabled:opacity-50`}>
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${channelFormTypes.includes(type.id) ? "border-primary-500 bg-primary-600" : "border-zinc-600"}`}>
                    {channelFormTypes.includes(type.id) && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <span className="font-medium">{type.label}</span>
                    <span className="ml-2 text-xs text-zinc-500">{type.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-zinc-200">Timeout Override</p>
            <p className="mb-2 text-xs text-zinc-500">Leave empty to inherit guild default</p>
            <NumberInput label="Seconds" value={channelFormTimeout ?? 0} onChange={(v) => setChannelFormTimeout(v || undefined)} min={0} max={604800} disabled={savingChannel} />
          </div>
        </div>
      </Modal>

      {/* ═══ Delete Confirmation ═══ */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Channel Override"
        footer={
          <>
            <button onClick={() => setShowDeleteModal(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleDeleteChannel}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deleting && <SpinnerIcon />}
              {deleting ? "Deleting…" : "Delete Override"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">Are you sure you want to remove this channel override? The channel will revert to using guild-wide defaults.</p>
      </Modal>
    </div>
  );
}

// ═══ Sub-Components ═══════════════════════════════════════

/** Reusable type checkbox button */
function TypeCheckbox({ type, checked, disabled, onChange }: { type: { id: string; label: string; description: string }; checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onChange}
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
        checked ? "border-primary-500/50 bg-primary-500/10 text-zinc-100" : "border-zinc-700/30 bg-white/5 text-zinc-400 hover:border-zinc-600/40 hover:text-zinc-200"
      } disabled:opacity-40 disabled:cursor-not-allowed`}>
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? "border-primary-500 bg-primary-600" : "border-zinc-600"}`}>
        {checked && (
          <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div>
        <p className="font-medium">{type.label}</p>
        <p className="text-xs text-zinc-500">{type.description}</p>
      </div>
    </button>
  );
}

/** Small loading spinner inline SVG */
function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
