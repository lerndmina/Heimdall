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
import Combobox from "@/components/ui/Combobox";
import RoleCombobox from "@/components/ui/RoleCombobox";
import NumberInput from "@/components/ui/NumberInput";
import Tabs from "@/components/ui/Tabs";
import SetupWizard, { NotConfigured, ReviewSection, ReviewRow } from "@/components/ui/SetupWizard";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
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
  bypassRoleIds: string[];
}

interface ChannelOverride {
  _id: string;
  guildId: string;
  channelId: string;
  allowedTypes?: string[];
  timeoutDuration?: number | null;
  bypassRoleIds?: string[];
  enabled: boolean;
  createdBy: string;
}

interface OpenerOverride {
  _id: string;
  guildId: string;
  openerChannelId: string;
  allowedTypes: string[];
  timeoutDuration: number;
  enabled: boolean;
  createdBy: string;
}

interface TempVCOpener {
  channelId: string;
  categoryId: string;
  channelName: string;
}

// ── Component ────────────────────────────────────────────

export default function AttachmentBlockerPage({ guildId }: { guildId: string }) {
  const canManage = useCanManage("attachment-blocker.manage_config");

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
  const [guildBypassRoleIds, setGuildBypassRoleIds] = useState<string[]>([]);
  const [savingGuild, setSavingGuild] = useState(false);

  // Channel override modal
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelOverride | null>(null);
  const [channelFormId, setChannelFormId] = useState("");
  const [channelFormTypes, setChannelFormTypes] = useState<string[]>([]);
  const [channelFormTimeout, setChannelFormTimeout] = useState<number | undefined>(undefined);
  const [channelFormBypassRoleIds, setChannelFormBypassRoleIds] = useState<string[]>([]);
  const [channelFormEnabled, setChannelFormEnabled] = useState(true);
  const [savingChannel, setSavingChannel] = useState(false);

  // Channel name lookup
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});
  const [roleNames, setRoleNames] = useState<Record<string, string>>({});

  // Delete modal
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // TempVC opener overrides
  const [tempvcOpeners, setTempvcOpeners] = useState<TempVCOpener[]>([]);
  const [openerConfigs, setOpenerConfigs] = useState<OpenerOverride[]>([]);
  const [voiceChannelNames, setVoiceChannelNames] = useState<Record<string, string>>({});
  const [showAddOpener, setShowAddOpener] = useState(false);
  const [editingOpener, setEditingOpener] = useState<OpenerOverride | null>(null);
  const [openerFormId, setOpenerFormId] = useState("");
  const [openerFormTypes, setOpenerFormTypes] = useState<string[]>([]);
  const [openerFormTimeout, setOpenerFormTimeout] = useState<number | undefined>(undefined);
  const [openerFormEnabled, setOpenerFormEnabled] = useState(true);
  const [savingOpener, setSavingOpener] = useState(false);
  const [deletingOpenerId, setDeletingOpenerId] = useState<string | null>(null);
  const [showDeleteOpenerModal, setShowDeleteOpenerModal] = useState(false);
  const [deletingOpener, setDeletingOpener] = useState(false);

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, channelsRes, discordChannelsRes, discordForumChannelsRes, rolesRes, tempvcConfigRes, openersRes, voiceChannelsRes] = await Promise.all([
        fetchApi<GuildConfig>(guildId, "attachment-blocker/config", { skipCache: true }),
        fetchApi<ChannelOverride[]>(guildId, "attachment-blocker/channels", { skipCache: true }),
        fetchApi<{ channels: { id: string; name: string }[] }>(guildId, "channels?type=text", {
          cacheKey: `channels-${guildId}-text`,
          cacheTtl: 60_000,
        }),
        fetchApi<{ channels: { id: string; name: string }[] }>(guildId, "channels?type=forum", {
          cacheKey: `channels-${guildId}-forum`,
          cacheTtl: 60_000,
        }),
        fetchApi<{ roles: { id: string; name: string }[] }>(guildId, "roles", {
          cacheKey: `roles-${guildId}`,
          cacheTtl: 60_000,
        }),
        fetchApi<{ channels: TempVCOpener[] }>(guildId, "tempvc/config", {
          cacheKey: `tempvc-config-${guildId}`,
          cacheTtl: 60_000,
        }),
        fetchApi<OpenerOverride[]>(guildId, "attachment-blocker/openers", { skipCache: true }),
        fetchApi<{ channels: { id: string; name: string }[] }>(guildId, "channels?type=voice", {
          cacheKey: `channels-${guildId}-voice`,
          cacheTtl: 60_000,
        }),
      ]);

      if (discordChannelsRes.success && discordChannelsRes.data) {
        const map: Record<string, string> = {};
        for (const ch of discordChannelsRes.data.channels) {
          map[ch.id] = ch.name;
        }
        // Merge forum channels into the same map
        if (discordForumChannelsRes.success && discordForumChannelsRes.data) {
          for (const ch of discordForumChannelsRes.data.channels) {
            map[ch.id] = ch.name;
          }
        }
        setChannelNames(map);
      }

      if (rolesRes.success && rolesRes.data) {
        const map: Record<string, string> = {};
        for (const role of rolesRes.data.roles) {
          map[role.id] = role.name;
        }
        setRoleNames(map);
      }

      if (voiceChannelsRes.success && voiceChannelsRes.data) {
        const map: Record<string, string> = {};
        for (const ch of voiceChannelsRes.data.channels) {
          map[ch.id] = ch.name;
        }
        setVoiceChannelNames(map);
      }

      if (tempvcConfigRes.success && tempvcConfigRes.data) {
        setTempvcOpeners(tempvcConfigRes.data.channels || []);
      }

      if (openersRes.success && openersRes.data) {
        setOpenerConfigs(openersRes.data);
      }

      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
        setGuildEnabled(configRes.data.enabled);
        setGuildAllowedTypes(configRes.data.defaultAllowedTypes);
        setGuildTimeoutSeconds(Math.round(configRes.data.defaultTimeoutDuration / 1000));
        setGuildBypassRoleIds(configRes.data.bypassRoleIds ?? []);
      } else {
        setConfig(null);
        setGuildEnabled(false);
        setGuildAllowedTypes([]);
        setGuildTimeoutSeconds(0);
        setGuildBypassRoleIds([]);
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

  useRealtimeEvent("attachment-blocker:updated", () => {
    fetchData();
  });

  useRealtimeEvent("tempvc:updated", () => {
    fetchData();
  });

  // ── Guild config dirty check ──
  const isGuildDirty =
    guildEnabled !== (config?.enabled ?? false) ||
    JSON.stringify(guildAllowedTypes.slice().sort()) !== JSON.stringify((config?.defaultAllowedTypes ?? []).slice().sort()) ||
    guildTimeoutSeconds !== Math.round((config?.defaultTimeoutDuration ?? 0) / 1000) ||
    JSON.stringify(guildBypassRoleIds.slice().sort()) !== JSON.stringify((config?.bypassRoleIds ?? []).slice().sort());

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
          bypassRoleIds: guildBypassRoleIds,
        }),
      });
      if (res.success && res.data) {
        setConfig(res.data);
        setGuildBypassRoleIds(res.data.bypassRoleIds ?? []);
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
    // Special types (all/none): toggle on/off
    if (typeId === "all" || typeId === "none") {
      return list.includes(typeId) ? [] : [typeId];
    }
    // Clicking a media type clears any active special type
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
    setChannelFormBypassRoleIds([]);
    setChannelFormEnabled(true);
    setShowAddChannel(true);
  };

  const openEditModal = (ch: ChannelOverride) => {
    setEditingChannel(ch);
    setChannelFormId(ch.channelId);
    setChannelFormTypes(ch.allowedTypes ?? []);
    setChannelFormTimeout(ch.timeoutDuration != null ? Math.round(ch.timeoutDuration / 1000) : undefined);
    setChannelFormBypassRoleIds(ch.bypassRoleIds ?? []);
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
          bypassRoleIds: channelFormBypassRoleIds,
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

  const addGuildBypassRole = (roleId: string) => {
    if (!roleId || guildBypassRoleIds.includes(roleId)) return;
    setGuildBypassRoleIds((prev) => [...prev, roleId]);
  };

  const removeGuildBypassRole = (roleId: string) => {
    setGuildBypassRoleIds((prev) => prev.filter((id) => id !== roleId));
  };

  const addChannelBypassRole = (roleId: string) => {
    if (!roleId || channelFormBypassRoleIds.includes(roleId)) return;
    setChannelFormBypassRoleIds((prev) => [...prev, roleId]);
  };

  const removeChannelBypassRole = (roleId: string) => {
    setChannelFormBypassRoleIds((prev) => prev.filter((id) => id !== roleId));
  };

  // ── Open add/edit opener modal ──
  const openAddOpenerModal = () => {
    setEditingOpener(null);
    setOpenerFormId("");
    setOpenerFormTypes([]);
    setOpenerFormTimeout(undefined);
    setOpenerFormEnabled(true);
    setShowAddOpener(true);
  };

  const openEditOpenerModal = (opener: OpenerOverride) => {
    setEditingOpener(opener);
    setOpenerFormId(opener.openerChannelId);
    setOpenerFormTypes(opener.allowedTypes ?? []);
    setOpenerFormTimeout(opener.timeoutDuration != null ? Math.round(opener.timeoutDuration / 1000) : undefined);
    setOpenerFormEnabled(opener.enabled);
    setShowAddOpener(true);
  };

  // ── Save opener override ──
  const saveOpenerOverride = async () => {
    const targetOpenerId = editingOpener?.openerChannelId ?? openerFormId;
    if (!targetOpenerId) {
      toast.error("Please select an opener channel");
      return;
    }

    setSavingOpener(true);
    try {
      const res = await fetchApi<OpenerOverride>(guildId, `attachment-blocker/openers/${targetOpenerId}`, {
        method: "PUT",
        body: JSON.stringify({
          allowedTypes: openerFormTypes.length > 0 ? openerFormTypes : undefined,
          timeoutDuration: openerFormTimeout !== undefined ? openerFormTimeout * 1000 : null,
          enabled: openerFormEnabled,
        }),
      });
      if (res.success && res.data) {
        setOpenerConfigs((prev) => {
          const idx = prev.findIndex((o) => o.openerChannelId === targetOpenerId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = res.data!;
            return next;
          }
          return [...prev, res.data!];
        });
        setShowAddOpener(false);
        toast.success(editingOpener ? "Opener override updated" : "Opener override added");
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSavingOpener(false);
    }
  };

  // ── Delete opener override ──
  const confirmDeleteOpener = (openerChannelId: string) => {
    setDeletingOpenerId(openerChannelId);
    setShowDeleteOpenerModal(true);
  };

  const handleDeleteOpener = async () => {
    if (!deletingOpenerId) return;
    setDeletingOpener(true);
    try {
      const res = await fetchApi(guildId, `attachment-blocker/openers/${deletingOpenerId}`, {
        method: "DELETE",
      });
      if (res.success) {
        setOpenerConfigs((prev) => prev.filter((o) => o.openerChannelId !== deletingOpenerId));
        setShowDeleteOpenerModal(false);
        setDeletingOpenerId(null);
        toast.success("Opener override deleted");
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeletingOpener(false);
    }
  };

  // ── Available openers (not yet configured) ──
  const availableOpeners = tempvcOpeners.filter((o) => !openerConfigs.some((c) => c.openerChannelId === o.channelId));

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
  const hasData = config !== null || channels.length > 0 || openerConfigs.length > 0 || tempvcOpeners.length > 0;

  if (loading && !hasData && !showWizard && !showAddChannel && !showAddOpener && !showDeleteModal && !showDeleteOpenerModal) {
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
                            disabled={!canManage || savingGuild}
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

                    <div>
                      <RoleCombobox
                        guildId={guildId}
                        value=""
                        onChange={addGuildBypassRole}
                        excludeIds={guildBypassRoleIds}
                        includeEveryone={false}
                        label="Global Bypass Roles"
                        description="Users with these roles bypass attachment-blocker checks across all channels"
                        disabled={!canManage || savingGuild}
                      />
                      {guildBypassRoleIds.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {guildBypassRoleIds.map((roleId) => (
                            <span key={roleId} className="inline-flex items-center gap-1 rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                              <span className="text-zinc-400">@</span>
                              {roleNames[roleId] ?? roleId}
                              {canManage && !savingGuild && (
                                <button onClick={() => removeGuildBypassRole(roleId)} className="text-zinc-500 hover:text-red-400">
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
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
                                  <span className="text-zinc-500">#</span> {channelNames[ch.channelId] || ch.channelId}
                                </span>
                                {channelNames[ch.channelId] && <span className="text-xs text-zinc-500">{ch.channelId}</span>}
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
                                {ch.bypassRoleIds && ch.bypassRoleIds.length > 0 && (
                                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">Bypass Roles: {ch.bypassRoleIds.length}</span>
                                )}
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
          {
            id: "tempvc",
            label: "TempVC Openers",
            icon: (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494M8.464 8.464a5 5 0 000 7.072M17.657 6.343a8 8 0 010 11.314M6.343 6.343a8 8 0 000 11.314"
                />
              </svg>
            ),
            content: (
              <div className="space-y-6">
                {tempvcOpeners.length === 0 ? (
                  <Card>
                    <CardContent>
                      <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-8 text-center">
                        <svg className="mx-auto mb-3 h-8 w-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494M8.464 8.464a5 5 0 000 7.072" />
                        </svg>
                        <p className="text-sm font-medium text-zinc-400">No TempVC openers configured</p>
                        <p className="mt-1 text-xs text-zinc-500">Set up TempVC openers first to add attachment rules for temporary voice channels.</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CardTitle>TempVC Opener Overrides</CardTitle>
                          <StatusBadge variant="neutral">{openerConfigs.length} configured</StatusBadge>
                        </div>
                        {canManage && availableOpeners.length > 0 && (
                          <button
                            onClick={openAddOpenerModal}
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/30 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Override
                          </button>
                        )}
                      </div>
                    </CardHeader>
                    <CardDescription>
                      Attachment rules for TempVC openers apply to all temporary channels spawned by that opener. These override guild defaults but are overridden by per-channel rules.
                    </CardDescription>

                    <CardContent className="mt-4">
                      {openerConfigs.length === 0 ? (
                        <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-8 text-center">
                          <svg className="mx-auto mb-3 h-8 w-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494M8.464 8.464a5 5 0 000 7.072" />
                          </svg>
                          <p className="text-sm font-medium text-zinc-400">No opener overrides yet</p>
                          <p className="mt-1 text-xs text-zinc-500">All temp VCs are using the global defaults.</p>
                          {canManage && (
                            <button
                              onClick={openAddOpenerModal}
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
                          {openerConfigs.map((opener) => {
                            const openerName = voiceChannelNames[opener.openerChannelId] || opener.openerChannelId;
                            return (
                              <div key={opener.openerChannelId} className="flex items-center justify-between rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-4 py-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-zinc-200">
                                      <span className="text-zinc-500">🔊</span> {openerName}
                                    </span>
                                    {voiceChannelNames[opener.openerChannelId] && <span className="text-xs text-zinc-500">{opener.openerChannelId}</span>}
                                    <StatusBadge variant={opener.enabled ? "success" : "neutral"}>{opener.enabled ? "Active" : "Disabled"}</StatusBadge>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1.5">
                                    {opener.allowedTypes && opener.allowedTypes.length > 0 ? (
                                      opener.allowedTypes.map((t) => (
                                        <span key={t} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                          {getTypeLabel(t)}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-xs text-zinc-500 italic">Inherits guild defaults</span>
                                    )}
                                    {opener.timeoutDuration != null && opener.timeoutDuration > 0 && (
                                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">Timeout: {Math.round(opener.timeoutDuration / 1000)}s</span>
                                    )}
                                  </div>
                                </div>
                                {canManage && (
                                  <div className="flex items-center gap-2 ml-4">
                                    <button onClick={() => openEditOpenerModal(opener)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200" title="Edit">
                                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => confirmDeleteOpener(opener.openerChannelId)}
                                      className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400"
                                      title="Delete">
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
                            );
                          })}
                        </div>
                      )}

                      {/* Resolution order info */}
                      <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
                        <strong>Resolution order:</strong> Per-channel override → TempVC opener override → Guild defaults. A channel-specific rule always wins over an opener rule.
                      </div>
                    </CardContent>
                  </Card>
                )}
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
            <div className="space-y-1.5">
              <p className="block text-sm font-medium text-zinc-200">Channel</p>
              <p className="text-xs text-zinc-500">Select the channel to override rules for (text or forum channels)</p>
              <Combobox
                options={Object.entries(channelNames).map(([id, name]) => ({
                  value: id,
                  label: `#${name}`,
                }))}
                value={channelFormId}
                onChange={setChannelFormId}
                placeholder="Select a channel…"
                disabled={savingChannel}
                loading={loading}
              />
            </div>
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

          <div>
            <RoleCombobox
              guildId={guildId}
              value=""
              onChange={addChannelBypassRole}
              excludeIds={channelFormBypassRoleIds}
              includeEveryone={false}
              label="Channel Bypass Roles"
              description="These roles bypass attachment-blocker checks in this channel (additive with global bypass)"
              disabled={savingChannel}
            />
            {channelFormBypassRoleIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {channelFormBypassRoleIds.map((roleId) => (
                  <span key={roleId} className="inline-flex items-center gap-1 rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                    <span className="text-zinc-400">@</span>
                    {roleNames[roleId] ?? roleId}
                    {!savingChannel && (
                      <button onClick={() => removeChannelBypassRole(roleId)} className="text-zinc-500 hover:text-red-400">
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
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

      {/* ═══ Add/Edit Opener Override Modal ═══ */}
      <Modal
        open={showAddOpener}
        onClose={() => setShowAddOpener(false)}
        title={editingOpener ? "Edit Opener Override" : "Add Opener Override"}
        footer={
          <>
            <button onClick={() => setShowAddOpener(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={saveOpenerOverride}
              disabled={savingOpener || (!editingOpener && !openerFormId)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
              {savingOpener && <SpinnerIcon />}
              {savingOpener ? "Saving…" : editingOpener ? "Update Override" : "Add Override"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {!editingOpener && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-200">Opener Channel</label>
              <p className="mb-2 text-xs text-zinc-500">Select a TempVC opener to configure attachment rules for</p>
              <select
                value={openerFormId}
                onChange={(e) => setOpenerFormId(e.target.value)}
                disabled={savingOpener}
                className="w-full rounded-lg border border-zinc-700/30 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 transition focus:border-primary-500 focus:outline-none disabled:opacity-50">
                <option value="">Select an opener…</option>
                {availableOpeners.map((opener) => (
                  <option key={opener.channelId} value={opener.channelId}>
                    🔊 {voiceChannelNames[opener.channelId] || opener.channelId}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Toggle label="Enabled" description="Whether attachment blocking applies to temp VCs from this opener" checked={openerFormEnabled} onChange={setOpenerFormEnabled} disabled={savingOpener} />

          <div>
            <p className="mb-2 text-sm font-medium text-zinc-200">Whitelisted Types</p>
            <p className="mb-2 text-xs text-zinc-500">Leave empty to inherit guild defaults</p>
            <div className="space-y-1.5">
              {[...ATTACHMENT_TYPES, ...SPECIAL_TYPES].map((type) => (
                <button
                  key={type.id}
                  disabled={savingOpener}
                  onClick={() => setOpenerFormTypes(toggleTypeInList(openerFormTypes, type.id))}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    openerFormTypes.includes(type.id) ? "border-primary-500/50 bg-primary-500/10 text-zinc-100" : "border-zinc-700/30 bg-white/5 text-zinc-400 hover:border-zinc-600/40"
                  } disabled:opacity-50`}>
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${openerFormTypes.includes(type.id) ? "border-primary-500 bg-primary-600" : "border-zinc-600"}`}>
                    {openerFormTypes.includes(type.id) && (
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
            <NumberInput label="Seconds" value={openerFormTimeout ?? 0} onChange={(v) => setOpenerFormTimeout(v || undefined)} min={0} max={604800} disabled={savingOpener} />
          </div>
        </div>
      </Modal>

      {/* ═══ Delete Opener Confirmation ═══ */}
      <Modal
        open={showDeleteOpenerModal}
        onClose={() => setShowDeleteOpenerModal(false)}
        title="Delete Opener Override"
        footer={
          <>
            <button onClick={() => setShowDeleteOpenerModal(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleDeleteOpener}
              disabled={deletingOpener}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deletingOpener && <SpinnerIcon />}
              {deletingOpener ? "Deleting…" : "Delete Override"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">Are you sure you want to remove this opener override? All temp VCs spawned by this opener will revert to using guild-wide defaults.</p>
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
