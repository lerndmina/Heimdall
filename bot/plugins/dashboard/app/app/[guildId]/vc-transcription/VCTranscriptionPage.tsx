/**
 * VCTranscriptionPage — Full configuration UI for voice message transcription.
 *
 * Sections:
 * 1. Transcription Mode (disabled / reactions / auto)
 * 2. Whisper Provider & Model (local whisper.cpp or OpenAI API)
 * 3. OpenAI API Key management (encrypted per-guild)
 * 4. Channel Filter (whitelist / blacklist / disabled)
 * 5. Role Filter (whitelist / blacklist / disabled)
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import Combobox from "@/components/ui/Combobox";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import RoleCombobox from "@/components/ui/RoleCombobox";
import Modal from "@/components/ui/Modal";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface VCTranscriptionConfig {
  guildId: string;
  mode: "disabled" | "reactions" | "auto";
  whisperProvider: "local" | "openai";
  whisperModel: string;
  roleFilter: { mode: "disabled" | "whitelist" | "blacklist"; roles: string[] };
  channelFilter: { mode: "disabled" | "whitelist" | "blacklist"; channels: string[] };
  hasApiKey: boolean;
}

const MODE_OPTIONS = [
  { value: "disabled", label: "🚫 Disabled" },
  { value: "reactions", label: "✍️ Reactions" },
  { value: "auto", label: "🤖 Auto" },
];

const PROVIDER_OPTIONS = [
  { value: "local", label: "Local (whisper.cpp)" },
  { value: "openai", label: "OpenAI API" },
];

const LOCAL_MODEL_OPTIONS = [
  { value: "tiny.en", label: "tiny.en (39 MB — fastest)" },
  { value: "base.en", label: "base.en (74 MB — recommended)" },
  { value: "small.en", label: "small.en (244 MB — better quality)" },
  { value: "medium.en", label: "medium.en (769 MB — high quality)" },
  { value: "large", label: "large (1.5 GB — best quality, multilingual)" },
];

const OPENAI_MODEL_OPTIONS = [{ value: "whisper-1", label: "whisper-1" }];

const FILTER_MODE_OPTIONS = [
  { value: "disabled", label: "Disabled (no filtering)" },
  { value: "whitelist", label: "Whitelist (allow only listed)" },
  { value: "blacklist", label: "Blacklist (block listed)" },
];

// ── Component ────────────────────────────────────────────

export default function VCTranscriptionConfigPage({ guildId }: { guildId: string }) {
  const canManage = useCanManage("vc-transcription.manage_config");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Config state
  const [mode, setMode] = useState<string>("disabled");
  const [provider, setProvider] = useState<string>("local");
  const [model, setModel] = useState<string>("base.en");
  const [hasApiKey, setHasApiKey] = useState(false);

  // Filter state
  const [roleFilterMode, setRoleFilterMode] = useState<string>("disabled");
  const [roleFilterRoles, setRoleFilterRoles] = useState<string[]>([]);
  const [channelFilterMode, setChannelFilterMode] = useState<string>("disabled");
  const [channelFilterChannels, setChannelFilterChannels] = useState<string[]>([]);

  // API Key state
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Dirty tracking
  const [originalConfig, setOriginalConfig] = useState<string>("");

  const getCurrentConfigHash = useCallback(() => {
    return JSON.stringify({ mode, provider, model, roleFilterMode, roleFilterRoles, channelFilterMode, channelFilterChannels });
  }, [mode, provider, model, roleFilterMode, roleFilterRoles, channelFilterMode, channelFilterChannels]);

  const isDirty = originalConfig !== getCurrentConfigHash();

  // ── Fetch config ──
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi<VCTranscriptionConfig>(guildId, "vc-transcription/config", { skipCache: true });
      if (res.success && res.data) {
        const c = res.data;
        setMode(c.mode);
        setProvider(c.whisperProvider);
        setModel(c.whisperModel);
        setHasApiKey(c.hasApiKey);
        setRoleFilterMode(c.roleFilter.mode);
        setRoleFilterRoles(c.roleFilter.roles);
        setChannelFilterMode(c.channelFilter.mode);
        setChannelFilterChannels(c.channelFilter.channels);

        const hash = JSON.stringify({
          mode: c.mode,
          provider: c.whisperProvider,
          model: c.whisperModel,
          roleFilterMode: c.roleFilter.mode,
          roleFilterRoles: c.roleFilter.roles,
          channelFilterMode: c.channelFilter.mode,
          channelFilterChannels: c.channelFilter.channels,
        });
        setOriginalConfig(hash);
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

  // When provider changes, reset model to sensible default
  useEffect(() => {
    if (provider === "openai") {
      setModel("whisper-1");
    } else if (provider === "local" && model === "whisper-1") {
      setModel("base.en");
    }
  }, [provider]);

  // ── Save config ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetchApi<VCTranscriptionConfig>(guildId, "vc-transcription/config", {
        method: "PUT",
        body: JSON.stringify({
          mode,
          whisperProvider: provider,
          whisperModel: model,
          roleFilter: { mode: roleFilterMode, roles: roleFilterRoles },
          channelFilter: { mode: channelFilterMode, channels: channelFilterChannels },
        }),
      });

      if (res.success) {
        setOriginalConfig(getCurrentConfigHash());
        toast.success("Transcription settings saved");
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  };

  // ── Save API Key ──
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    setSavingApiKey(true);
    try {
      const res = await fetchApi(guildId, "vc-transcription/apikey", {
        method: "PUT",
        body: JSON.stringify({ apiKey: apiKeyInput }),
      });
      if (res.success) {
        setHasApiKey(true);
        setApiKeyInput("");
        toast.success("API key saved and encrypted");
      } else {
        toast.error(res.error?.message ?? "Failed to save API key");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSavingApiKey(false);
    }
  };

  // ── Delete API Key ──
  const handleDeleteApiKey = async () => {
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, "vc-transcription/apikey", { method: "DELETE" });
      if (res.success) {
        setHasApiKey(false);
        toast.success("API key removed");
      } else {
        toast.error(res.error?.message ?? "Failed to remove API key");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  // ── Delete all config ──
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetchApi(guildId, "vc-transcription/config", { method: "DELETE" });
      if (res.success) {
        setMode("disabled");
        setProvider("local");
        setModel("base.en");
        setHasApiKey(false);
        setRoleFilterMode("disabled");
        setRoleFilterRoles([]);
        setChannelFilterMode("disabled");
        setChannelFilterChannels([]);
        setOriginalConfig(
          JSON.stringify({
            mode: "disabled",
            provider: "local",
            model: "base.en",
            roleFilterMode: "disabled",
            roleFilterRoles: [],
            channelFilterMode: "disabled",
            channelFilterChannels: [],
          }),
        );
        toast.success("Configuration reset to defaults");
      } else {
        toast.error(res.error?.message ?? "Failed to reset");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setResetting(false);
      setShowResetModal(false);
    }
  };

  // ── Add/Remove helpers for filter lists ──
  const addChannel = (channelId: string) => {
    if (channelId && !channelFilterChannels.includes(channelId)) {
      setChannelFilterChannels([...channelFilterChannels, channelId]);
    }
  };

  const removeChannel = (channelId: string) => {
    setChannelFilterChannels(channelFilterChannels.filter((c) => c !== channelId));
  };

  const addRole = (roleId: string) => {
    if (roleId && !roleFilterRoles.includes(roleId)) {
      setRoleFilterRoles([...roleFilterRoles, roleId]);
    }
  };

  const removeRole = (roleId: string) => {
    setRoleFilterRoles(roleFilterRoles.filter((r) => r !== roleId));
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading configuration…" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchConfig} className="mt-3 rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const modelOptions = provider === "openai" ? OPENAI_MODEL_OPTIONS : LOCAL_MODEL_OPTIONS;

  return (
    <div className="space-y-6">
      {/* ── Mode Section ── */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Transcription Mode</CardTitle>
          <StatusBadge variant={mode === "disabled" ? "neutral" : mode === "auto" ? "success" : "info"}>{mode === "disabled" ? "Disabled" : mode === "auto" ? "Auto" : "Reactions"}</StatusBadge>
        </div>
        <CardDescription className="mt-1">Choose how voice messages are transcribed in your server.</CardDescription>
        <CardContent className="mt-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-200">Mode</p>
            <p className="text-xs text-zinc-500">
              <strong>Disabled</strong> — no transcription. <strong>Reactions</strong> — users react with ✍️ to transcribe. <strong>Auto</strong> — all voice messages are transcribed automatically.
            </p>
            <Combobox options={MODE_OPTIONS} value={mode} onChange={setMode} placeholder="Select mode…" disabled={!canManage} />
          </div>
        </CardContent>
      </Card>

      {/* ── Provider & Model Section ── */}
      <Card>
        <CardTitle>Whisper Provider</CardTitle>
        <CardDescription className="mt-1">Choose between running Whisper locally or using OpenAI&apos;s cloud API.</CardDescription>
        <CardContent className="mt-4 space-y-5">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-200">Provider</p>
            <p className="text-xs text-zinc-500">
              <strong>Local</strong> — uses whisper.cpp on the server (no API key needed, requires FFmpeg). <strong>OpenAI API</strong> — uses OpenAI&apos;s Whisper API (requires API key, more
              accurate).
            </p>
            <Combobox options={PROVIDER_OPTIONS} value={provider} onChange={setProvider} placeholder="Select provider…" disabled={!canManage} />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-200">Model</p>
            <p className="text-xs text-zinc-500">{provider === "local" ? "Larger models are more accurate but slower and use more memory." : "OpenAI currently offers the whisper-1 model."}</p>
            <Combobox options={modelOptions} value={model} onChange={setModel} placeholder="Select model…" disabled={!canManage} />
          </div>
        </CardContent>
      </Card>

      {/* ── API Key Section (only for OpenAI) ── */}
      {provider === "openai" && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>OpenAI API Key</CardTitle>
            <StatusBadge variant={hasApiKey ? "success" : "warning"}>{hasApiKey ? "Configured" : "Not Set"}</StatusBadge>
          </div>
          <CardDescription className="mt-1">Your API key is encrypted at rest using AES-256-CBC and never exposed via the API.</CardDescription>
          <CardContent className="mt-4 space-y-4">
            {hasApiKey && (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <svg className="h-5 w-5 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-emerald-300">API key is configured and encrypted</p>
                  <p className="text-xs text-emerald-400/60">You can replace it below or remove it.</p>
                </div>
              </div>
            )}

            {canManage && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-200">{hasApiKey ? "Replace API Key" : "API Key"}</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="flex-1 rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 backdrop-blur-sm transition focus:border-primary-500/50 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                    />
                    <button
                      onClick={handleSaveApiKey}
                      disabled={savingApiKey || !apiKeyInput.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
                      {savingApiKey ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                          <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : null}
                      {savingApiKey ? "Saving…" : "Save Key"}
                    </button>
                  </div>
                </div>

                {hasApiKey && (
                  <button onClick={() => setShowDeleteModal(true)} className="inline-flex items-center gap-2 text-xs font-medium text-red-400 transition hover:text-red-300">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Remove API Key
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Channel Filter Section ── */}
      <Card>
        <CardTitle>Channel Filter</CardTitle>
        <CardDescription className="mt-1">Control which channels voice messages are transcribed in.</CardDescription>
        <CardContent className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-200">Filter Mode</p>
            <Combobox
              options={FILTER_MODE_OPTIONS}
              value={channelFilterMode}
              onChange={(v) => {
                setChannelFilterMode(v);
                if (v === "disabled") setChannelFilterChannels([]);
              }}
              placeholder="Select filter mode…"
              disabled={!canManage}
            />
          </div>

          {channelFilterMode !== "disabled" && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-200">{channelFilterMode === "whitelist" ? "Allowed Channels" : "Blocked Channels"}</p>

              {/* Selected channels list */}
              {channelFilterChannels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {channelFilterChannels.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/30 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                      #{id}
                      {canManage && (
                        <button onClick={() => removeChannel(id)} className="ml-0.5 rounded-full p-0.5 transition hover:bg-white/10 hover:text-red-400">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Add channel */}
              {canManage && (
                <ChannelCombobox
                  guildId={guildId}
                  value=""
                  onChange={(v) => {
                    addChannel(v);
                  }}
                  channelType="text"
                  placeholder="Add a channel…"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Role Filter Section ── */}
      <Card>
        <CardTitle>Role Filter</CardTitle>
        <CardDescription className="mt-1">Control which roles can have their voice messages transcribed.</CardDescription>
        <CardContent className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-200">Filter Mode</p>
            <Combobox
              options={FILTER_MODE_OPTIONS}
              value={roleFilterMode}
              onChange={(v) => {
                setRoleFilterMode(v);
                if (v === "disabled") setRoleFilterRoles([]);
              }}
              placeholder="Select filter mode…"
              disabled={!canManage}
            />
          </div>

          {roleFilterMode !== "disabled" && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-200">{roleFilterMode === "whitelist" ? "Allowed Roles" : "Blocked Roles"}</p>

              {/* Selected roles list */}
              {roleFilterRoles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {roleFilterRoles.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/30 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                      @{id}
                      {canManage && (
                        <button onClick={() => removeRole(id)} className="ml-0.5 rounded-full p-0.5 transition hover:bg-white/10 hover:text-red-400">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Add role */}
              {canManage && (
                <RoleCombobox
                  guildId={guildId}
                  value=""
                  onChange={(v) => {
                    addRole(v);
                  }}
                  placeholder="Add a role…"
                  excludeIds={roleFilterRoles}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Action Bar ── */}
      {canManage && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-700/30 bg-zinc-900/40 px-4 py-3 backdrop-blur-xl">
          <button
            onClick={() => setShowResetModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Reset All
          </button>

          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? "Saving…" : isDirty ? "Save Changes" : "No Changes"}
          </button>
        </div>
      )}

      {/* ── Delete API Key Modal ── */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Remove API Key"
        footer={
          <>
            <button onClick={() => setShowDeleteModal(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleDeleteApiKey}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deleting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {deleting ? "Removing…" : "Remove Key"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">Are you sure you want to remove the OpenAI API key? Voice transcription will stop working if the provider is set to OpenAI.</p>
      </Modal>

      {/* ── Reset Config Modal ── */}
      <Modal
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Reset Configuration"
        footer={
          <>
            <button onClick={() => setShowResetModal(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {resetting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {resetting ? "Resetting…" : "Reset Everything"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">
          This will delete all voice transcription settings, including filters and the stored API key. Transcription will be disabled. This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
