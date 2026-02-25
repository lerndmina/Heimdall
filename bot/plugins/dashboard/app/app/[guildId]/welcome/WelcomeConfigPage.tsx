/**
 * WelcomeConfigPage — full CRUD for welcome message configuration.
 *
 * - No config → empty state with "Enable" button
 * - Config exists → read-only view with Edit / Test / Delete actions
 * - Edit mode → inline form with channel picker, message textarea, variable reference
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Textarea from "@/components/ui/Textarea";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import Toggle from "@/components/ui/Toggle";
import EmbedEditor, { type EmbedData } from "@/components/ui/EmbedEditor";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface WelcomeConfig {
  guildId: string;
  channelId: string;
  message: string;
  useEmbed?: boolean;
  embedTitle?: string;
  embedColor?: number;
  embedImage?: string;
  embedThumbnail?: string;
  embedFooter?: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplateVariable {
  variable: string;
  description: string;
  example: string;
}

// ── Component ────────────────────────────────────────────

export default function WelcomeConfigPage({ guildId }: { guildId: string }) {
  const canManage = useCanManage("welcome.manage_config");

  const [config, setConfig] = useState<WelcomeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [draftChannel, setDraftChannel] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [draftUseEmbed, setDraftUseEmbed] = useState(false);
  const [draftEmbed, setDraftEmbed] = useState<EmbedData>({});
  const [saving, setSaving] = useState(false);

  // Variables
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [showVars, setShowVars] = useState(false);

  // Test / Delete modals
  const [testing, setTesting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch config ──
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetchApi<WelcomeConfig>(guildId, "welcome/config", { skipCache: true });
      if (res.success && res.data) {
        setConfig(res.data);
      } else if (res.error?.code === "NOT_FOUND") {
        setNotFound(true);
      } else {
        setError(res.error?.message ?? "Failed to load configuration");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  // ── Fetch variables ──
  const fetchVariables = useCallback(async () => {
    try {
      const res = await fetchApi<{ variables: TemplateVariable[] }>(guildId, "welcome/variables", {
        cacheKey: `welcome-vars-${guildId}`,
        cacheTtl: 300_000,
      });
      if (res.success && res.data) setVariables(res.data.variables);
    } catch {
      // non-critical
    }
  }, [guildId]);

  useEffect(() => {
    fetchConfig();
    fetchVariables();
  }, [fetchConfig, fetchVariables]);

  useRealtimeEvent("welcome:updated", () => {
    fetchConfig();
  });

  // ── Save handler ──
  const handleSave = async () => {
    if (!draftChannel.trim()) {
      toast.error("Please select a channel");
      return;
    }
    if (!draftMessage.trim()) {
      toast.error("Please enter a welcome message");
      return;
    }

    setSaving(true);
    try {
      const embedColor = draftUseEmbed && draftEmbed.color ? parseInt(draftEmbed.color.replace("#", ""), 16) || undefined : undefined;

      const res = await fetchApi<WelcomeConfig>(guildId, "welcome/config", {
        method: "PUT",
        body: JSON.stringify({
          channelId: draftChannel,
          message: draftMessage,
          useEmbed: draftUseEmbed,
          embedTitle: draftUseEmbed ? draftEmbed.title?.trim() || undefined : undefined,
          embedColor,
          embedImage: draftUseEmbed ? draftEmbed.image?.trim() || undefined : undefined,
          embedThumbnail: draftUseEmbed ? draftEmbed.thumbnail?.trim() || undefined : undefined,
          embedFooter: draftUseEmbed ? draftEmbed.footer?.trim() || undefined : undefined,
        }),
      });
      if (res.success) {
        setConfig({ guildId, channelId: draftChannel, message: draftMessage, createdAt: res.data?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
        setNotFound(false);
        setEditing(false);
        toast.success("Welcome message saved");
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  };

  // ── Test handler ──
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetchApi<{ channelId: string }>(guildId, "welcome/test", { method: "POST" });
      if (res.success) {
        toast.success("Test message sent to the configured channel");
      } else {
        toast.error(res.error?.message ?? "Test failed");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setTesting(false);
    }
  };

  // ── Delete handler ──
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetchApi(guildId, "welcome/config", { method: "DELETE" });
      if (res.success) {
        setConfig(null);
        setNotFound(true);
        setShowDeleteModal(false);
        toast.success("Welcome message configuration deleted");
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  // ── Open edit mode ──
  const openEdit = (isCreate = false) => {
    if (isCreate) {
      setDraftChannel("");
      setDraftMessage("Welcome to {guild}, {mention}! You are member #{membercount}.");
      setDraftUseEmbed(false);
      setDraftEmbed({});
    } else if (config) {
      setDraftChannel(config.channelId);
      setDraftMessage(config.message);
      setDraftUseEmbed(config.useEmbed ?? false);
      setDraftEmbed({
        title: config.embedTitle ?? "",
        color: config.embedColor ? `#${config.embedColor.toString(16).padStart(6, "0")}` : "",
        image: config.embedImage ?? "",
        thumbnail: config.embedThumbnail ?? "",
        footer: config.embedFooter ?? "",
      });
    }
    setEditing(true);
  };

  // ====== Loading ======
  if (loading && !config && !notFound && !editing) {
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

  // ====== Edit mode ======
  if (editing) {
    return (
      <div className="space-y-6">
        <Card>
          <CardTitle>{config ? "Edit Welcome Message" : "Enable Welcome Messages"}</CardTitle>
          <CardContent className="mt-4 space-y-5">
            <ChannelCombobox
              guildId={guildId}
              value={draftChannel}
              onChange={setDraftChannel}
              channelType="text"
              excludeForums
              label="Welcome Channel"
              description="The channel where welcome messages will be sent"
              placeholder="Select a channel…"
            />

            <Textarea
              label={draftUseEmbed ? "Embed Description" : "Message Template"}
              description={draftUseEmbed ? "The main text of the embed. Use variables below to personalize it." : "The welcome message to send. Use variables below to personalize it."}
              value={draftMessage}
              onChange={setDraftMessage}
              maxLength={draftUseEmbed ? 4096 : 2000}
              rows={5}
              placeholder="Welcome to the server, {mention}!"
            />

            {/* Send as Embed toggle */}
            <Toggle label="Send as Embed" description="Display the welcome message as a rich embed instead of plain text" checked={draftUseEmbed} onChange={setDraftUseEmbed} />

            {draftUseEmbed && <EmbedEditor value={draftEmbed} onChange={setDraftEmbed} descriptionRows={0} heading="Embed Settings" compact />}

            {/* Variable reference */}
            <div>
              <button onClick={() => setShowVars(!showVars)} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300 transition">
                <svg className={`h-3.5 w-3.5 transition-transform ${showVars ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Template Variables
              </button>
              {showVars && variables.length > 0 && (
                <div className="mt-2 rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-3">
                  <div className="space-y-1.5">
                    {variables.map((v) => (
                      <div key={v.variable} className="flex items-start gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => setDraftMessage((m) => m + v.variable)}
                          className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-mono text-primary-400 hover:bg-white/15 transition"
                          title="Click to insert">
                          {v.variable}
                        </button>
                        <span className="text-zinc-400">{v.description}</span>
                        <span className="ml-auto text-zinc-600">e.g. {v.example}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button onClick={() => setEditing(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draftChannel || !draftMessage.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? "Saving…" : config ? "Save Changes" : "Enable Welcome Messages"}
          </button>
        </div>
      </div>
    );
  }

  // ====== No config — empty state ======
  if (notFound || !config) {
    return (
      <Card className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-white/5 backdrop-blur-sm p-4">
          <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
        <CardTitle>No Welcome Message Configured</CardTitle>
        <CardDescription className="mt-2 max-w-md">Set up an automatic welcome message to greet new members when they join your server.</CardDescription>
        {canManage && (
          <button onClick={() => openEdit(true)} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Enable Welcome Messages
          </button>
        )}
      </Card>
    );
  }

  // ====== Read-only view ======
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <StatusBadge variant="success">Active</StatusBadge>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          <FieldDisplay label="Channel" value={`<#${config.channelId}>`}>
            <span className="text-sm text-zinc-200">#{config.channelId}</span>
          </FieldDisplay>
          <FieldDisplay label="Format">
            <span className="text-sm text-zinc-200">{config.useEmbed ? "Rich Embed" : "Plain Text"}</span>
          </FieldDisplay>
          <FieldDisplay label={config.useEmbed ? "Embed Description" : "Message Template"}>
            <div className="mt-1 rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-3">
              <pre className="whitespace-pre-wrap text-sm text-zinc-200 font-sans">{config.message}</pre>
            </div>
          </FieldDisplay>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Created" value={new Date(config.createdAt).toLocaleDateString()} />
            <FieldDisplay label="Last Updated" value={new Date(config.updatedAt).toLocaleDateString()} />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50">
            {testing ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            Test Message
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete
          </button>
          <button onClick={() => openEdit(false)} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Welcome Message"
        footer={
          <>
            <button onClick={() => setShowDeleteModal(false)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
              {deleting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {deleting ? "Deleting…" : "Delete Configuration"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">Are you sure you want to delete the welcome message configuration? New members will no longer receive a welcome message. This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

// ── Helper ───────────────────────────────────────────────

function FieldDisplay({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-1">{children ?? <p className="text-sm text-zinc-200">{value ?? "—"}</p>}</div>
    </div>
  );
}
