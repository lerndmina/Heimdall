/**
 * AttachmentBlockerPage — Full management UI for guild-wide defaults and per-channel overrides.
 *
 * - Guild Defaults card: enable/disable, allowed types, timeout duration
 * - Channel Overrides table: list, add, edit, remove per-channel overrides
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
import { usePermissions } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

const ATTACHMENT_TYPES = [
  { id: "image", label: "Images", description: "PNG, JPEG, WebP, etc." },
  { id: "video", label: "Videos & GIFs", description: "MP4, WebM, GIF, APNG" },
  { id: "audio", label: "Audio", description: "MP3, WAV, OGG, FLAC, etc." },
  { id: "all", label: "All Attachments", description: "Allow everything" },
  { id: "none", label: "No Attachments", description: "Block everything" },
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

  // ── Type toggle handler ──
  const toggleType = (typeId: string) => {
    if (typeId === "all") {
      setGuildAllowedTypes(["all"]);
      return;
    }
    if (typeId === "none") {
      setGuildAllowedTypes(["none"]);
      return;
    }
    // Remove all/none and toggle the specific type
    const filtered = guildAllowedTypes.filter((t) => t !== "all" && t !== "none");
    if (filtered.includes(typeId)) {
      setGuildAllowedTypes(filtered.filter((t) => t !== typeId));
    } else {
      setGuildAllowedTypes([...filtered, typeId]);
    }
  };

  // ── Channel type toggle ──
  const toggleChannelType = (typeId: string) => {
    if (typeId === "all") {
      setChannelFormTypes(["all"]);
      return;
    }
    if (typeId === "none") {
      setChannelFormTypes(["none"]);
      return;
    }
    const filtered = channelFormTypes.filter((t) => t !== "all" && t !== "none");
    if (filtered.includes(typeId)) {
      setChannelFormTypes(filtered.filter((t) => t !== typeId));
    } else {
      setChannelFormTypes([...filtered, typeId]);
    }
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
  const getTypeLabel = (id: string) => ATTACHMENT_TYPES.find((t) => t.id === id)?.label ?? id;

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

  return (
    <div className="space-y-6">
      {/* ═══ Guild Defaults Card ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Guild Defaults</CardTitle>
            <StatusBadge variant={guildEnabled ? "success" : "neutral"}>
              {guildEnabled ? "Enabled" : "Disabled"}
            </StatusBadge>
          </div>
          {savingGuild && (
            <svg className="h-5 w-5 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </CardHeader>
        <CardDescription>
          Set default attachment blocking rules that apply to all channels. Individual channels can override these settings.
        </CardDescription>

        <CardContent className="mt-4 space-y-5">
          <Toggle
            label="Enable Attachment Blocker"
            description="When enabled, only whitelisted attachment types are allowed"
            checked={guildEnabled}
            onChange={setGuildEnabled}
            disabled={!canManage || savingGuild}
          />

          {/* Allowed types */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Whitelisted Types</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ATTACHMENT_TYPES.map((type) => (
                <button
                  key={type.id}
                  disabled={!canManage || savingGuild}
                  onClick={() => toggleType(type.id)}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
                    guildAllowedTypes.includes(type.id)
                      ? "border-primary-500/50 bg-primary-500/10 text-zinc-100"
                      : "border-zinc-700/30 bg-white/5 text-zinc-400 hover:border-zinc-600/40 hover:text-zinc-200"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      guildAllowedTypes.includes(type.id)
                        ? "border-primary-500 bg-primary-600"
                        : "border-zinc-600"
                    }`}>
                    {guildAllowedTypes.includes(type.id) && (
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
              ))}
            </div>
          </div>

          {/* Timeout */}
          <div>
            <p className="mb-1 text-sm font-medium text-zinc-200">Timeout Duration</p>
            <p className="mb-2 text-xs text-zinc-500">Automatically timeout users who violate the rules (0 = no timeout)</p>
            <div className="max-w-xs">
              <NumberInput
                label="Seconds"
                value={guildTimeoutSeconds}
                onChange={setGuildTimeoutSeconds}
                min={0}
                max={604800}
                disabled={!canManage || savingGuild}
              />
            </div>
          </div>

          {/* Save */}
          {canManage && isGuildDirty && (
            <div className="flex justify-end">
              <button
                onClick={saveGuildConfig}
                disabled={savingGuild}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
                Save Guild Defaults
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Channel Overrides Card ═══ */}
      <Card>
        <CardHeader>
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
        </CardHeader>
        <CardDescription>
          Override guild defaults for specific channels. Channels without overrides inherit the guild defaults.
        </CardDescription>

        <CardContent className="mt-4">
          {channels.length === 0 ? (
            <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-6 text-center">
              <p className="text-sm text-zinc-500">No channel overrides configured. All channels use guild defaults.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {channels.map((ch) => (
                <div
                  key={ch.channelId}
                  className="flex items-center justify-between rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">
                        <span className="text-zinc-500">#</span> {ch.channelId}
                      </span>
                      <StatusBadge variant={ch.enabled ? "success" : "neutral"}>
                        {ch.enabled ? "Active" : "Disabled"}
                      </StatusBadge>
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
                      {ch.timeoutDuration != null && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                          Timeout: {Math.round(ch.timeoutDuration / 1000)}s
                        </span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => openEditModal(ch)}
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
                        title="Edit">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => confirmDeleteChannel(ch.channelId)}
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400"
                        title="Delete">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

      {/* ═══ Add/Edit Channel Override Modal ═══ */}
      <Modal
        open={showAddChannel}
        onClose={() => setShowAddChannel(false)}
        title={editingChannel ? "Edit Channel Override" : "Add Channel Override"}
        footer={
          <>
            <button
              onClick={() => setShowAddChannel(false)}
              className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={saveChannelOverride}
              disabled={savingChannel || (!editingChannel && !channelFormId)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
              {savingChannel && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
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

          <Toggle
            label="Enabled"
            description="Whether attachment blocking is active for this channel"
            checked={channelFormEnabled}
            onChange={setChannelFormEnabled}
            disabled={savingChannel}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-zinc-200">Whitelisted Types</p>
            <p className="mb-2 text-xs text-zinc-500">Leave empty to inherit guild defaults</p>
            <div className="space-y-1.5">
              {ATTACHMENT_TYPES.map((type) => (
                <button
                  key={type.id}
                  disabled={savingChannel}
                  onClick={() => toggleChannelType(type.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    channelFormTypes.includes(type.id)
                      ? "border-primary-500/50 bg-primary-500/10 text-zinc-100"
                      : "border-zinc-700/30 bg-white/5 text-zinc-400 hover:border-zinc-600/40"
                  } disabled:opacity-50`}>
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      channelFormTypes.includes(type.id) ? "border-primary-500 bg-primary-600" : "border-zinc-600"
                    }`}>
                    {channelFormTypes.includes(type.id) && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-zinc-200">Timeout Override</p>
            <p className="mb-2 text-xs text-zinc-500">Leave empty to inherit guild default</p>
            <NumberInput
              label="Seconds"
              value={channelFormTimeout ?? 0}
              onChange={(v) => setChannelFormTimeout(v || undefined)}
              min={0}
              max={604800}
              disabled={savingChannel}
            />
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
            <button
              onClick={() => setShowDeleteModal(false)}
              className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleDeleteChannel}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deleting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {deleting ? "Deleting…" : "Delete Override"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">
          Are you sure you want to remove this channel override? The channel will revert to using guild-wide defaults.
        </p>
      </Modal>
    </div>
  );
}
