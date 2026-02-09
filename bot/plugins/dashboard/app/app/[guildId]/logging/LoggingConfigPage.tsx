/**
 * LoggingConfigPage — per-category logging configuration with subcategory toggles.
 *
 * Each logging category (Messages, Users, Moderation) gets its own card with:
 * - Enable/disable toggle
 * - Channel selector
 * - Subcategory toggles
 *
 * Changes are saved per-category via PUT /logging/config.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Toggle from "@/components/ui/Toggle";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface SubcategoryMeta {
  id: string;
  name: string;
  description: string;
}

interface CategoryMeta {
  id: string;
  name: string;
  description: string;
  subcategories: SubcategoryMeta[];
}

interface CategoryConfig {
  category: string;
  channelId: string;
  enabled: boolean;
  subcategories: Record<string, boolean>;
}

interface LoggingConfig {
  guildId: string;
  categories: CategoryConfig[];
  globalEnabled: boolean;
}

interface TestResult {
  category: string;
  success: boolean;
  error?: string;
}

// ── Component ────────────────────────────────────────────

export default function LoggingConfigPage({ guildId }: { guildId: string }) {
  const canManage = useCanManage("logging.manage_config");

  const [config, setConfig] = useState<LoggingConfig | null>(null);
  const [eventsMeta, setEventsMeta] = useState<CategoryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-category saving state
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  // Test / delete modals
  const [showTestModal, setShowTestModal] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, eventsRes] = await Promise.all([
        fetchApi<LoggingConfig>(guildId, "logging/config", { skipCache: true }),
        fetchApi<{ categories: CategoryMeta[] }>(guildId, "logging/events", {
          cacheKey: `logging-events-${guildId}`,
          cacheTtl: 300_000,
        }),
      ]);

      if (eventsRes.success && eventsRes.data) {
        setEventsMeta(eventsRes.data.categories);
      }

      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
      } else {
        // Any config failure (NOT_FOUND, plugin not loaded, etc.) → treat as unconfigured.
        // Category cards handle null config gracefully with "Not Configured" badges.
        setConfig(null);
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

  useRealtimeEvent("logging:updated", () => {
    fetchData();
  });

  // ── Get category config ──
  const getCategoryConfig = (categoryId: string): CategoryConfig | null => {
    return config?.categories.find((c) => c.category === categoryId) ?? null;
  };

  // ── Save a category ──
  const saveCategory = async (categoryId: string, updates: { channelId?: string; enabled?: boolean; subcategories?: Record<string, boolean> }) => {
    setSavingCategory(categoryId);
    try {
      const res = await fetchApi<LoggingConfig>(guildId, "logging/config", {
        method: "PUT",
        body: JSON.stringify({ category: categoryId, ...updates }),
      });
      if (res.success && res.data) {
        setConfig(res.data);
        toast.success(`${categoryId.charAt(0).toUpperCase() + categoryId.slice(1)} logging updated`);
      } else {
        toast.error(res.error?.message ?? "Failed to save");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setSavingCategory(null);
    }
  };

  // ── Test handler ──
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetchApi<{ results: TestResult[] }>(guildId, "logging/test", { method: "POST" });
      if (res.success && res.data) {
        setTestResults(res.data.results);
        setShowTestModal(true);
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
      const res = await fetchApi(guildId, "logging/config", { method: "DELETE" });
      if (res.success) {
        setConfig(null);
        setShowDeleteModal(false);
        toast.success("Logging configuration deleted");
      } else {
        toast.error(res.error?.message ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to connect to API");
    } finally {
      setDeleting(false);
    }
  };

  // ====== Loading ======
  if (loading && eventsMeta.length === 0 && !showTestModal && !showDeleteModal) {
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

  // ====== No events metadata (shouldn't happen but guard) ======
  if (eventsMeta.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-zinc-400">Failed to load logging event categories.</p>
        </CardContent>
      </Card>
    );
  }

  const hasAnyConfig = config && config.categories.length > 0;

  return (
    <div className="space-y-6">
      {/* Category cards */}
      {eventsMeta.map((meta) => (
        <CategoryCard
          key={meta.id}
          guildId={guildId}
          meta={meta}
          currentConfig={getCategoryConfig(meta.id)}
          canManage={canManage}
          saving={savingCategory === meta.id}
          onSave={(updates) => saveCategory(meta.id, updates)}
        />
      ))}

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-3 justify-end">
          {hasAnyConfig && (
            <>
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
                Test All Channels
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
                Delete All Logging
              </button>
            </>
          )}
        </div>
      )}

      {/* Test results modal */}
      <Modal open={showTestModal} onClose={() => setShowTestModal(false)} title="Test Results">
        <div className="space-y-3">
          {testResults.map((r) => (
            <div key={r.category} className="flex items-center justify-between rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm px-4 py-3">
              <span className="text-sm font-medium text-zinc-200 capitalize">{r.category}</span>
              {r.success ? <StatusBadge variant="success">Sent</StatusBadge> : <StatusBadge variant="error">{r.error ?? "Failed"}</StatusBadge>}
            </div>
          ))}
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete All Logging"
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
              {deleting ? "Deleting…" : "Delete All Logging"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-400">Are you sure you want to delete all logging configuration? All logging channels and settings will be removed. This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

// ── Category Card ────────────────────────────────────────

interface CategoryCardProps {
  guildId: string;
  meta: CategoryMeta;
  currentConfig: CategoryConfig | null;
  canManage: boolean;
  saving: boolean;
  onSave: (updates: { channelId?: string; enabled?: boolean; subcategories?: Record<string, boolean> }) => void;
}

function CategoryCard({ guildId, meta, currentConfig, canManage, saving, onSave }: CategoryCardProps) {
  const [channelId, setChannelId] = useState(currentConfig?.channelId ?? "");
  const [enabled, setEnabled] = useState(currentConfig?.enabled ?? false);
  const [subcategories, setSubcategories] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const sub of meta.subcategories) {
      defaults[sub.id] = currentConfig?.subcategories?.[sub.id] ?? true;
    }
    return defaults;
  });

  // Track if anything changed
  const isDirty =
    channelId !== (currentConfig?.channelId ?? "") ||
    enabled !== (currentConfig?.enabled ?? false) ||
    meta.subcategories.some((sub) => subcategories[sub.id] !== (currentConfig?.subcategories?.[sub.id] ?? true));

  const handleSave = () => {
    const updates: { channelId?: string; enabled?: boolean; subcategories?: Record<string, boolean> } = {};
    if (channelId !== (currentConfig?.channelId ?? "")) updates.channelId = channelId;
    if (enabled !== (currentConfig?.enabled ?? false)) updates.enabled = enabled;
    // Always send subcategories if saving
    updates.subcategories = subcategories;
    if (channelId) updates.channelId = channelId;
    updates.enabled = enabled;
    onSave(updates);
  };

  const isConfigured = !!currentConfig?.channelId;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle>{meta.name}</CardTitle>
          {isConfigured ? <StatusBadge variant={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</StatusBadge> : <StatusBadge variant="neutral">Not Configured</StatusBadge>}
        </div>
        {saving && (
          <svg className="h-5 w-5 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>
      <CardDescription className="mt-1">{meta.description}</CardDescription>

      <CardContent className="mt-4 space-y-4">
        {canManage && (
          <>
            <Toggle label="Enable Category" description="Enable or disable logging for this category" checked={enabled} onChange={setEnabled} disabled={saving} />

            <ChannelCombobox
              guildId={guildId}
              value={channelId}
              onChange={setChannelId}
              channelType="text"
              label="Log Channel"
              description="The channel where log messages will be sent"
              disabled={saving}
            />
          </>
        )}

        {/* Subcategory toggles */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Event Types</p>
          <div className="space-y-3 rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-4">
            {meta.subcategories.map((sub) => (
              <Toggle
                key={sub.id}
                label={sub.name}
                description={sub.description}
                checked={subcategories[sub.id] ?? true}
                onChange={(v) => setSubcategories((s) => ({ ...s, [sub.id]: v }))}
                disabled={!canManage || saving}
              />
            ))}
          </div>
        </div>

        {/* Save button */}
        {canManage && isDirty && (
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !channelId}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
              Save {meta.name} Settings
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
