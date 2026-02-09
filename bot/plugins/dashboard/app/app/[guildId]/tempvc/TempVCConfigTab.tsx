/**
 * TempVCConfigTab — manage creator channel configurations.
 *
 * Each creator channel is a voice channel that spawns a temp VC when a user joins it.
 * Full CRUD: add, edit, remove creator channels, then save all at once via PUT.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Toggle from "@/components/ui/Toggle";
import TextInput from "@/components/ui/TextInput";
import Modal from "@/components/ui/Modal";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import RoleCombobox from "@/components/ui/RoleCombobox";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

type PermissionState = "allow" | "deny" | "neutral";
type PermissionMode = "none" | "inherit_opener" | "inherit_category" | "custom";

interface RoleOverride {
  roleId: string;
  view: PermissionState;
  connect: PermissionState;
}

interface ChannelConfig {
  channelId: string;
  categoryId: string;
  useSequentialNames: boolean;
  channelName: string;
  permissionMode: PermissionMode;
  roleOverrides: RoleOverride[];
  sendInviteDM: boolean;
}

interface TempVCConfig {
  guildId: string;
  channels: ChannelConfig[];
  createdAt: string;
  updatedAt: string;
}

// ── Constants ────────────────────────────────────────────

const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  none: "None (Owner Only)",
  inherit_opener: "Inherit from Opener",
  inherit_category: "Inherit from Category",
  custom: "Custom Roles",
};

const PERMISSION_MODE_OPTIONS: { value: PermissionMode; label: string; description: string }[] = [
  { value: "none", label: "None", description: "Only the channel owner gets manage permissions" },
  { value: "inherit_opener", label: "Inherit from Opener", description: "Copy permission overwrites from the opener channel" },
  { value: "inherit_category", label: "Inherit from Category", description: "Copy permission overwrites from the target category" },
  { value: "custom", label: "Custom Roles", description: "Define custom View/Connect permissions per role" },
];

// ── Component ────────────────────────────────────────────

export default function TempVCConfigTab({ guildId }: { guildId: string }) {
  const canManage = useCanManage("tempvc.manage_config");

  const [config, setConfig] = useState<TempVCConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Draft channels for editing
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draftChannel, setDraftChannel] = useState<ChannelConfig>({
    channelId: "",
    categoryId: "",
    useSequentialNames: false,
    channelName: "Temp VC",
    permissionMode: "none",
    roleOverrides: [],
    sendInviteDM: false,
  });

  // Delete confirmation
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // ── Fetch ──
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi<TempVCConfig>(guildId, "tempvc/config", { skipCache: true });
      if (res.success && res.data) {
        setConfig(res.data);
        setChannels(res.data.channels);
      } else {
        setError(res.error?.message ?? "Failed to load configuration");
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

  useRealtimeEvent("dashboard:data_changed", () => {
    fetchConfig();
  });

  // ── Save all channels ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetchApi<TempVCConfig>(guildId, "tempvc/config", {
        method: "PUT",
        body: JSON.stringify({ channels }),
      });
      if (res.success && res.data) {
        setConfig(res.data);
        setChannels(res.data.channels);
        setDirty(false);
        toast.success("Creator channels saved");
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete all config ──
  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const res = await fetchApi(guildId, "tempvc/config", { method: "DELETE" });
      if (res.success) {
        setConfig(null);
        setChannels([]);
        setDirty(false);
        setShowDeleteAllModal(false);
        toast.success("Temp VC configuration deleted");
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeletingAll(false);
    }
  };

  // ── Modal handlers ──
  const openAddModal = () => {
    setEditIndex(null);
    setDraftChannel({ channelId: "", categoryId: "", useSequentialNames: false, channelName: "Temp VC", permissionMode: "none", roleOverrides: [], sendInviteDM: false });
    setModalOpen(true);
  };

  const openEditModal = (index: number) => {
    setEditIndex(index);
    setDraftChannel({ ...channels[index]! });
    setModalOpen(true);
  };

  const handleModalSave = () => {
    if (!draftChannel.channelId || !draftChannel.categoryId) {
      toast.error("Please select both a voice channel and a category");
      return;
    }

    const updated = [...channels];
    if (editIndex !== null) {
      updated[editIndex] = { ...draftChannel };
    } else {
      // Check for duplicate channelId
      if (updated.some((c) => c.channelId === draftChannel.channelId)) {
        toast.error("This voice channel is already configured as a creator");
        return;
      }
      updated.push({ ...draftChannel });
    }

    setChannels(updated);
    setDirty(true);
    setModalOpen(false);
  };

  const handleRemoveChannel = (index: number) => {
    setChannels((chs) => chs.filter((_, i) => i !== index));
    setDirty(true);
    setDeleteIndex(null);
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

  return (
    <div className="space-y-6">
      {/* Channel list */}
      {channels.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 p-4">
            <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-8.464a5 5 0 000 7.072" />
            </svg>
          </div>
          <CardTitle>No Creator Channels</CardTitle>
          <CardDescription className="mt-2 max-w-md">Add a voice channel as a creator — when users join it, a temporary voice channel will be spawned for them.</CardDescription>
          {canManage && (
            <button onClick={openAddModal} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Creator Channel
            </button>
          )}
        </Card>
      ) : (
        <>
          {channels.map((ch, i) => (
            <Card key={`${ch.channelId}-${i}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-200">Creator Channel</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Voice Channel: {ch.channelId}</p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditModal(i)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200" title="Edit">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button onClick={() => setDeleteIndex(i)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400" title="Remove">
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
              <CardContent className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldDisplay label="Category" value={ch.categoryId} />
                  <FieldDisplay label="Channel Name Template" value={ch.channelName || "Temp VC"} />
                  <FieldDisplay label="Sequential Names" value={ch.useSequentialNames ? "Yes" : "No"} />
                  <FieldDisplay label="Permission Mode" value={PERMISSION_MODE_LABELS[ch.permissionMode] ?? "None"} />
                  <FieldDisplay label="Invite DM" value={ch.sendInviteDM ? "Enabled" : "Disabled"} />
                  {ch.permissionMode === "custom" && ch.roleOverrides.length > 0 && (
                    <FieldDisplay label="Role Overrides" value={`${ch.roleOverrides.length} role${ch.roleOverrides.length !== 1 ? "s" : ""}`} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Add more button */}
          {canManage && (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700/30 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-primary-500 hover:text-primary-400">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Creator Channel
            </button>
          )}
        </>
      )}

      {/* Dirty-state save bar */}
      {dirty && canManage && (
        <div className="sticky bottom-4 z-40 flex items-center justify-between rounded-xl border border-zinc-700/30 bg-zinc-900/40 backdrop-blur-xl px-6 py-3 shadow-xl">
          <p className="text-sm text-zinc-300">You have unsaved changes</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setChannels(config?.channels ?? []);
                setDirty(false);
              }}
              className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
              {saving && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {canManage && channels.length > 0 && !dirty && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowDeleteAllModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete All Configuration
          </button>
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editIndex !== null ? "Edit Creator Channel" : "Add Creator Channel"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleModalSave}
              disabled={!draftChannel.channelId || !draftChannel.categoryId}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {editIndex !== null ? "Update" : "Add"}
            </button>
          </>
        }>
        <div className="space-y-4">
          <ChannelCombobox
            guildId={guildId}
            value={draftChannel.channelId}
            onChange={(v) => setDraftChannel((d) => ({ ...d, channelId: v }))}
            channelType="voice"
            label="Voice Channel"
            description="The voice channel users join to create a temp VC"
          />

          <ChannelCombobox
            guildId={guildId}
            value={draftChannel.categoryId}
            onChange={(v) => setDraftChannel((d) => ({ ...d, categoryId: v }))}
            channelType="category"
            label="Category"
            description="The category where temp VCs will be created"
          />

          <TextInput
            label="Channel Name Template"
            description="Name for created channels. Use {user} for the user's display name."
            value={draftChannel.channelName}
            onChange={(v) => setDraftChannel((d) => ({ ...d, channelName: v }))}
            placeholder="Temp VC"
          />

          <Toggle
            label="Sequential Names"
            description="Use numbered names (Temp VC 1, Temp VC 2, etc.) instead of the user's name"
            checked={draftChannel.useSequentialNames}
            onChange={(v) => setDraftChannel((d) => ({ ...d, useSequentialNames: v }))}
          />

          {/* ── Permission Mode ── */}
          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-1">Permission Mode</label>
            <p className="text-xs text-zinc-500 mb-2">How permissions are applied to spawned temp VCs</p>
            <div className="space-y-2">
              {PERMISSION_MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    draftChannel.permissionMode === opt.value ? "border-primary-500 bg-primary-500/10" : "border-zinc-700/30 hover:border-zinc-600/50"
                  }`}>
                  <input
                    type="radio"
                    name="permissionMode"
                    value={opt.value}
                    checked={draftChannel.permissionMode === opt.value}
                    onChange={() => setDraftChannel((d) => ({ ...d, permissionMode: opt.value }))}
                    className="mt-0.5 accent-primary-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                    <p className="text-xs text-zinc-500">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ── Custom Role Overrides ── */}
          {draftChannel.permissionMode === "custom" && (
            <div>
              <label className="block text-sm font-medium text-zinc-200 mb-1">Role Overrides</label>
              <p className="text-xs text-zinc-500 mb-3">Configure View and Connect permissions per role</p>
              <div className="space-y-3">
                {draftChannel.roleOverrides.map((ro, i) => (
                  <div key={`${ro.roleId}-${i}`} className="rounded-lg border border-zinc-700/30 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <RoleCombobox
                        guildId={guildId}
                        value={ro.roleId}
                        onChange={(v) => {
                          setDraftChannel((d) => {
                            const updated = [...d.roleOverrides];
                            updated[i] = { ...updated[i]!, roleId: v };
                            return { ...d, roleOverrides: updated };
                          });
                        }}
                        label=""
                        excludeIds={draftChannel.roleOverrides.filter((_, j) => j !== i).map((r) => r.roleId)}
                      />
                      <button
                        onClick={() =>
                          setDraftChannel((d) => ({
                            ...d,
                            roleOverrides: d.roleOverrides.filter((_, j) => j !== i),
                          }))
                        }
                        className="shrink-0 ml-2 rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400"
                        title="Remove override">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <PermToggle
                        label="View Channel"
                        value={ro.view}
                        onChange={(v) => {
                          setDraftChannel((d) => {
                            const updated = [...d.roleOverrides];
                            updated[i] = { ...updated[i]!, view: v };
                            return { ...d, roleOverrides: updated };
                          });
                        }}
                      />
                      <PermToggle
                        label="Connect"
                        value={ro.connect}
                        onChange={(v) => {
                          setDraftChannel((d) => {
                            const updated = [...d.roleOverrides];
                            updated[i] = { ...updated[i]!, connect: v };
                            return { ...d, roleOverrides: updated };
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}

                <button
                  onClick={() =>
                    setDraftChannel((d) => ({
                      ...d,
                      roleOverrides: [...d.roleOverrides, { roleId: "", view: "neutral", connect: "neutral" }],
                    }))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700/30 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-primary-500 hover:text-primary-400">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Role Override
                </button>
              </div>
            </div>
          )}

          {/* ── Invite DM ── */}
          <Toggle
            label="DM Invited Users"
            description="Send a DM with a channel link when users are invited to a temp VC"
            checked={draftChannel.sendInviteDM}
            onChange={(v) => setDraftChannel((d) => ({ ...d, sendInviteDM: v }))}
          />
        </div>
      </Modal>

      {/* Remove channel confirmation */}
      <Modal
        open={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        title="Remove Creator Channel"
        footer={
          <>
            <button onClick={() => setDeleteIndex(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button onClick={() => deleteIndex !== null && handleRemoveChannel(deleteIndex)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500">
              Remove
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">Are you sure you want to remove this creator channel? You will need to save changes for this to take effect.</p>
      </Modal>

      {/* Delete all confirmation */}
      <Modal
        open={showDeleteAllModal}
        onClose={() => setShowDeleteAllModal(false)}
        title="Delete All Configuration"
        footer={
          <>
            <button onClick={() => setShowDeleteAllModal(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deletingAll && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {deletingAll ? "Deleting…" : "Delete All"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">Are you sure you want to delete all Temp VC configuration? Creator channels and tracking data will be removed. This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function FieldDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-200">{value}</p>
    </div>
  );
}

const PERM_STATE_STYLES: Record<PermissionState, { bg: string; text: string }> = {
  allow: { bg: "bg-emerald-500/20 border-emerald-500/50 text-emerald-400", text: "Allow" },
  deny: { bg: "bg-red-500/20 border-red-500/50 text-red-400", text: "Deny" },
  neutral: { bg: "bg-zinc-700/20 border-zinc-700/50 text-zinc-400", text: "Neutral" },
};

function PermToggle({ label, value, onChange }: { label: string; value: PermissionState; onChange: (v: PermissionState) => void }) {
  const cycle: PermissionState[] = ["neutral", "allow", "deny"];
  const next = () => {
    const idx = cycle.indexOf(value);
    onChange(cycle[(idx + 1) % cycle.length]!);
  };
  const style = PERM_STATE_STYLES[value];
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <button type="button" onClick={next} className={`w-full rounded-lg border px-3 py-1.5 text-xs font-medium transition ${style.bg}`}>
        {style.text}
      </button>
    </div>
  );
}
