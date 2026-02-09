/**
 * ModerationPage — Dashboard page for managing moderation settings.
 *
 * Tabs: Overview · Rules · Presets · Escalation · Infractions · Settings
 *
 * API endpoints:
 *   GET    /moderation/config                    → config
 *   PUT    /moderation/config                    → config
 *   GET    /moderation/stats                     → stats
 *   GET    /moderation/rules                     → { rules[], total }
 *   POST   /moderation/rules                     → rule
 *   PUT    /moderation/rules/:id                 → rule
 *   DELETE /moderation/rules/:id                 → { deleted }
 *   PATCH  /moderation/rules/:id/toggle          → rule
 *   POST   /moderation/rules/test                → { matched, matchedPatterns }
 *   GET    /moderation/presets                    → presets[]
 *   POST   /moderation/presets/:id/install        → rule
 *   DELETE /moderation/presets/:id                → { deleted }
 *   GET    /moderation/infractions?userId&page    → { infractions[], total, page, pages }
 *   GET    /moderation/infractions/:userId        → { infractions[], activePoints }
 *   DELETE /moderation/infractions/:userId        → { cleared }
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Tabs from "@/components/ui/Tabs";
import Toggle from "@/components/ui/Toggle";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import Modal from "@/components/ui/Modal";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { fetchApi } from "@/lib/api";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface ModerationConfig {
  guildId: string;
  automodEnabled: boolean;
  logChannelId?: string;
  pointDecayEnabled: boolean;
  pointDecayDays: number;
  dmOnInfraction: boolean;
  defaultDmTemplate?: string;
  defaultDmEmbed: boolean;
  dmMode: string;
  immuneRoles: string[];
  escalationTiers: EscalationTier[];
}

interface EscalationTier {
  name: string;
  pointsThreshold: number;
  action: "timeout" | "kick" | "ban";
  duration?: string;
  dmTemplate?: string;
  dmEmbed?: boolean;
}

interface AutomodRule {
  _id: string;
  guildId: string;
  name: string;
  enabled: boolean;
  patterns: { regex: string; flags?: string; label?: string }[];
  matchMode: "any" | "all";
  target: string;
  actions: string[];
  warnPoints: number;
  priority: number;
  isPreset: boolean;
  presetId?: string;
  channelInclude: string[];
  channelExclude: string[];
  roleInclude: string[];
  roleExclude: string[];
  dmTemplate?: string;
  dmEmbed?: boolean;
}

interface Preset {
  id: string;
  name: string;
  description: string;
  patterns: { regex: string; flags?: string; label?: string }[];
  target: string;
  actions: string[];
  warnPoints: number;
  installed: boolean;
  ruleId: string | null;
  enabled: boolean;
}

interface Infraction {
  _id: string;
  guildId: string;
  userId: string;
  moderatorId?: string;
  source: string;
  type: string;
  reason?: string;
  ruleName?: string;
  pointsAssigned: number;
  totalPointsAfter: number;
  active: boolean;
  createdAt: string;
}

interface Stats {
  totalInfractions: number;
  activeInfractions: number;
  bySource: Record<string, number>;
  byType: Record<string, number>;
  automodEnabled: boolean;
  totalRules: number;
  enabledRules: number;
  escalationTiers: number;
  pointDecayEnabled: boolean;
  pointDecayDays: number;
}

// ── Component ────────────────────────────────────────────

export default function ModerationPage({ guildId }: { guildId: string }) {
  const canManageConfig = useCanManage("moderation.manage_config");
  const canManageRules = useCanManage("moderation.manage_rules");
  const canManageInfractions = useCanManage("moderation.manage_infractions");
  const canManagePresets = useCanManage("moderation.manage_presets");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Moderation</h1>
        <p className="text-zinc-400">Manage automod rules, infractions, escalation tiers, and settings.</p>
      </div>

      <Tabs
        defaultTab="overview"
        tabs={[
          { id: "overview", label: "Overview", content: <OverviewTab guildId={guildId} /> },
          { id: "rules", label: "Rules", content: <RulesTab guildId={guildId} canManage={canManageRules} /> },
          { id: "presets", label: "Presets", content: <PresetsTab guildId={guildId} canManage={canManagePresets} /> },
          { id: "escalation", label: "Escalation", content: <EscalationTab guildId={guildId} canManage={canManageConfig} /> },
          { id: "infractions", label: "Infractions", content: <InfractionsTab guildId={guildId} canManage={canManageInfractions} /> },
          { id: "settings", label: "Settings", content: <SettingsTab guildId={guildId} canManage={canManageConfig} /> },
        ]}
      />
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────

function OverviewTab({ guildId }: { guildId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetchApi<Stats>(guildId, "moderation/stats", { skipCache: true });
      if (res.success && res.data) setStats(res.data);
      setLoading(false);
    })();
  }, [guildId]);

  if (loading) return <Spinner />;
  if (!stats) return <p className="text-zinc-400">Failed to load statistics.</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card>
        <CardTitle>Automod</CardTitle>
        <CardContent>
          <p className={stats.automodEnabled ? "text-green-400" : "text-red-400"}>{stats.automodEnabled ? "✅ Enabled" : "❌ Disabled"}</p>
          <p className="text-zinc-400 text-sm mt-1">
            {stats.enabledRules}/{stats.totalRules} rules active
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardTitle>Infractions</CardTitle>
        <CardContent>
          <p className="text-2xl font-bold">{stats.totalInfractions}</p>
          <p className="text-zinc-400 text-sm">{stats.activeInfractions} active</p>
        </CardContent>
      </Card>

      <Card>
        <CardTitle>Escalation</CardTitle>
        <CardContent>
          <p className="text-2xl font-bold">{stats.escalationTiers}</p>
          <p className="text-zinc-400 text-sm">tier{stats.escalationTiers !== 1 ? "s" : ""} configured</p>
        </CardContent>
      </Card>

      <Card>
        <CardTitle>Point Decay</CardTitle>
        <CardContent>
          <p className={stats.pointDecayEnabled ? "text-green-400" : "text-zinc-400"}>{stats.pointDecayEnabled ? `${stats.pointDecayDays} day decay` : "Disabled"}</p>
        </CardContent>
      </Card>

      {Object.keys(stats.bySource).length > 0 && (
        <Card>
          <CardTitle>By Source</CardTitle>
          <CardContent>
            {Object.entries(stats.bySource).map(([source, count]) => (
              <div key={source} className="flex justify-between text-sm">
                <span className="text-zinc-300 capitalize">{source}</span>
                <span className="text-zinc-400">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {Object.keys(stats.byType).length > 0 && (
        <Card>
          <CardTitle>By Type</CardTitle>
          <CardContent>
            {Object.entries(stats.byType)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 6)
              .map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-zinc-300">{type}</span>
                  <span className="text-zinc-400">{count}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Rules Tab ────────────────────────────────────────────

function RulesTab({ guildId, canManage }: { guildId: string; canManage: boolean }) {
  const [rules, setRules] = useState<AutomodRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<AutomodRule | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [patternsText, setPatternsText] = useState("");
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [actions, setActions] = useState<string[]>(["delete", "warn"]);
  const [warnPoints, setWarnPoints] = useState(1);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    const res = await fetchApi<{ rules: AutomodRule[]; total: number }>(guildId, "moderation/rules", { skipCache: true });
    if (res.success && res.data) setRules(res.data.rules);
    setLoading(false);
  }, [guildId]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  function openCreate() {
    setEditRule(null);
    setName("");
    setPatternsText("");
    setMatchMode("any");
    setActions(["delete", "warn"]);
    setWarnPoints(1);
    setModalOpen(true);
  }

  function openEdit(rule: AutomodRule) {
    setEditRule(rule);
    setName(rule.name);
    setPatternsText(rule.patterns.map((p) => p.regex).join("\n"));
    setMatchMode(rule.matchMode);
    setActions(rule.actions);
    setWarnPoints(rule.warnPoints);
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const patterns = patternsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((regex) => ({ regex }));

    const body = { name, patterns, matchMode, actions, warnPoints };

    if (editRule) {
      const res = await fetchApi<AutomodRule>(guildId, `moderation/rules/${editRule._id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (res.success) {
        toast.success("Rule updated");
        setModalOpen(false);
        loadRules();
      } else {
        toast.error(res.error?.message ?? "Failed to update rule");
      }
    } else {
      const res = await fetchApi<AutomodRule>(guildId, "moderation/rules", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.success) {
        toast.success("Rule created");
        setModalOpen(false);
        loadRules();
      } else {
        toast.error(res.error?.message ?? "Failed to create rule");
      }
    }
    setSaving(false);
  }

  async function handleToggle(rule: AutomodRule) {
    const res = await fetchApi<AutomodRule>(guildId, `moderation/rules/${rule._id}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (res.success) {
      toast.success(`Rule ${rule.enabled ? "disabled" : "enabled"}`);
      loadRules();
    } else {
      toast.error("Failed to toggle rule");
    }
  }

  async function handleDelete(rule: AutomodRule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    const res = await fetchApi(guildId, `moderation/rules/${rule._id}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Rule deleted");
      loadRules();
    } else {
      toast.error("Failed to delete rule");
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button onClick={openCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 text-sm font-medium">
            + New Rule
          </button>
        </div>
      )}

      {rules.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-zinc-400 text-center py-4">No automod rules configured. Create one or install a preset.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule._id}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${rule.enabled ? "bg-green-400" : "bg-zinc-500"}`} />
                    <div>
                      <p className="font-medium text-zinc-100">
                        {rule.name}
                        {rule.isPreset && <span className="ml-2 text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">Preset</span>}
                      </p>
                      <p className="text-sm text-zinc-400">
                        {rule.patterns.length} pattern{rule.patterns.length !== 1 ? "s" : ""} · {rule.actions.join(", ")} · {rule.warnPoints} pts
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Toggle label="Enabled" checked={rule.enabled} onChange={() => handleToggle(rule)} />
                      <button onClick={() => openEdit(rule)} className="text-sm text-zinc-400 hover:text-zinc-200">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(rule)} className="text-sm text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRule ? "Edit Rule" : "New Rule"}>
        <div className="space-y-4">
          <TextInput label="Rule Name" value={name} onChange={setName} placeholder="e.g. slur-filter" />
          <Textarea
            label="Patterns (one regex per line)"
            value={patternsText}
            onChange={setPatternsText}
            placeholder="\\bslur1\\b&#10;\\bslur2\\b"
            rows={4}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Match Mode</label>
              <select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as "any" | "all")}
                className="w-full rounded-md bg-zinc-800 border border-zinc-600 text-zinc-100 px-3 py-2 text-sm">
                <option value="any">Any pattern</option>
                <option value="all">All patterns</option>
              </select>
            </div>
            <TextInput label="Warn Points" value={String(warnPoints)} onChange={(v) => setWarnPoints(parseInt(v) || 0)} type="number" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name || !patternsText}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 text-sm font-medium disabled:opacity-50">
              {saving ? "Saving..." : editRule ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Presets Tab ───────────────────────────────────────────

function PresetsTab({ guildId, canManage }: { guildId: string; canManage: boolean }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPresets = useCallback(async () => {
    const res = await fetchApi<Preset[]>(guildId, "moderation/presets", { skipCache: true });
    if (res.success && res.data) setPresets(res.data);
    setLoading(false);
  }, [guildId]);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  async function install(presetId: string) {
    const res = await fetchApi(guildId, `moderation/presets/${presetId}/install`, { method: "POST" });
    if (res.success) {
      toast.success("Preset installed");
      loadPresets();
    } else {
      toast.error(res.error?.message ?? "Failed to install preset");
    }
  }

  async function uninstall(presetId: string) {
    const res = await fetchApi(guildId, `moderation/presets/${presetId}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Preset uninstalled");
      loadPresets();
    } else {
      toast.error("Failed to uninstall preset");
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {presets.map((preset) => (
        <Card key={preset.id}>
          <CardTitle>{preset.name}</CardTitle>
          <CardDescription>{preset.description}</CardDescription>
          <CardContent>
            <div className="flex items-center justify-between mt-2">
              <span className={`text-sm ${preset.installed ? "text-green-400" : "text-zinc-500"}`}>{preset.installed ? "Installed" : "Not installed"}</span>
              {canManage &&
                (preset.installed ? (
                  <button onClick={() => uninstall(preset.id)} className="text-sm text-red-400 hover:text-red-300">
                    Uninstall
                  </button>
                ) : (
                  <button onClick={() => install(preset.id)} className="text-sm text-indigo-400 hover:text-indigo-300">
                    Install
                  </button>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Escalation Tab ───────────────────────────────────────

function EscalationTab({ guildId, canManage }: { guildId: string; canManage: boolean }) {
  const [config, setConfig] = useState<ModerationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<EscalationTier[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetchApi<ModerationConfig>(guildId, "moderation/config", { skipCache: true });
      if (res.success && res.data) {
        setConfig(res.data);
        setTiers(res.data.escalationTiers ?? []);
      }
      setLoading(false);
    })();
  }, [guildId]);

  function addTier() {
    setTiers([...tiers, { name: "", pointsThreshold: 10, action: "timeout", duration: "1h" }]);
  }

  function removeTier(index: number) {
    setTiers(tiers.filter((_, i) => i !== index));
  }

  function updateTier(index: number, field: string, value: any) {
    setTiers(tiers.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  async function saveTiers() {
    setSaving(true);
    const res = await fetchApi<ModerationConfig>(guildId, "moderation/config", {
      method: "PUT",
      body: JSON.stringify({ escalationTiers: tiers }),
    });
    if (res.success) {
      toast.success("Escalation tiers saved");
      if (res.data) setConfig(res.data);
    } else {
      toast.error(res.error?.message ?? "Failed to save");
    }
    setSaving(false);
  }

  if (loading) return <Spinner />;
  if (!config) return <p className="text-zinc-400">Failed to load config.</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Escalation Tiers</CardTitle>
        <CardDescription>When a user&apos;s active points cross a tier threshold, the configured action is automatically applied. Tiers are checked from highest threshold to lowest.</CardDescription>
        <CardContent>
          <div className="space-y-3">
            {tiers.length === 0 && <p className="text-zinc-500 text-sm text-center py-2">No escalation tiers configured.</p>}
            {tiers.map((tier, i) => (
              <div key={i} className="flex items-end gap-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <div className="flex-1">
                  <TextInput label="Name" value={tier.name} onChange={(v) => updateTier(i, "name", v)} placeholder="e.g. Warning" />
                </div>
                <div className="w-24">
                  <TextInput label="Points" value={String(tier.pointsThreshold)} onChange={(v) => updateTier(i, "pointsThreshold", parseInt(v) || 0)} type="number" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Action</label>
                  <select
                    value={tier.action}
                    onChange={(e) => updateTier(i, "action", e.target.value)}
                    className="w-full rounded-md bg-zinc-800 border border-zinc-600 text-zinc-100 px-3 py-2 text-sm">
                    <option value="timeout">Timeout</option>
                    <option value="kick">Kick</option>
                    <option value="ban">Ban</option>
                  </select>
                </div>
                {tier.action === "timeout" && (
                  <div className="w-28">
                    <TextInput label="Duration" value={tier.duration ?? ""} onChange={(v) => updateTier(i, "duration", v)} placeholder="e.g. 1h, 1d" />
                  </div>
                )}
                {canManage && (
                  <button onClick={() => removeTier(i)} className="text-red-400 hover:text-red-300 pb-2">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {canManage && (
            <div className="flex justify-between mt-4">
              <button onClick={addTier} className="text-sm text-indigo-400 hover:text-indigo-300">
                + Add Tier
              </button>
              <button onClick={saveTiers} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 text-sm font-medium disabled:opacity-50">
                {saving ? "Saving..." : "Save Tiers"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Infractions Tab ──────────────────────────────────────

function InfractionsTab({ guildId, canManage }: { guildId: string; canManage: boolean }) {
  const [infractions, setInfractions] = useState<Infraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchUserId, setSearchUserId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const loadInfractions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (searchUserId) params.set("userId", searchUserId);

    const res = await fetchApi<{ infractions: Infraction[]; total: number; pages: number }>(guildId, `moderation/infractions?${params}`, { skipCache: true });
    if (res.success && res.data) {
      setInfractions(res.data.infractions);
      setTotalPages(res.data.pages);
    }
    setLoading(false);
  }, [guildId, page, searchUserId]);

  useEffect(() => {
    loadInfractions();
  }, [loadInfractions]);

  async function clearInfractions(userId: string) {
    if (!confirm(`Clear all active infractions for user ${userId}?`)) return;
    const res = await fetchApi(guildId, `moderation/infractions/${userId}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Infractions cleared");
      loadInfractions();
    } else {
      toast.error("Failed to clear infractions");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <TextInput
                label="Search by User ID"
                value={searchUserId}
                onChange={(v) => {
                  setSearchUserId(v);
                  setPage(1);
                }}
                placeholder="e.g. 123456789012345678"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Spinner />
      ) : infractions.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-zinc-400 text-center py-4">No infractions found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {infractions.map((inf) => (
            <Card key={inf._id}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${inf.source === "automod" ? "bg-blue-900 text-blue-300" : "bg-purple-900 text-purple-300"}`}>{inf.source}</span>
                      <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">{inf.type}</span>
                      <span className={`text-xs ${inf.active ? "text-green-400" : "text-zinc-500"}`}>{inf.active ? "Active" : "Cleared"}</span>
                    </div>
                    <p className="text-sm text-zinc-300 mt-1">
                      User: <code className="text-zinc-100">{inf.userId}</code>
                      {inf.moderatorId && (
                        <>
                          {" "}
                          · By: <code className="text-zinc-100">{inf.moderatorId}</code>
                        </>
                      )}
                    </p>
                    <p className="text-sm text-zinc-400">{inf.reason ?? "No reason"}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {inf.pointsAssigned} pts · Total: {inf.totalPointsAfter} pts · {new Date(inf.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {canManage && inf.active && (
                    <button onClick={() => clearInfractions(inf.userId)} className="text-sm text-red-400 hover:text-red-300">
                      Clear All
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 text-sm bg-zinc-800 rounded disabled:opacity-50 text-zinc-300">
                Prev
              </button>
              <span className="px-3 py-1 text-sm text-zinc-400">
                Page {page} of {totalPages}
              </span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1 text-sm bg-zinc-800 rounded disabled:opacity-50 text-zinc-300">
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────

function SettingsTab({ guildId, canManage }: { guildId: string; canManage: boolean }) {
  const [config, setConfig] = useState<ModerationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local form state
  const [automodEnabled, setAutomodEnabled] = useState(false);
  const [logChannelId, setLogChannelId] = useState("");
  const [pointDecayEnabled, setPointDecayEnabled] = useState(false);
  const [pointDecayDays, setPointDecayDays] = useState(30);
  const [dmOnInfraction, setDmOnInfraction] = useState(true);
  const [defaultDmTemplate, setDefaultDmTemplate] = useState("");
  const [dmMode, setDmMode] = useState("text");

  useEffect(() => {
    (async () => {
      const res = await fetchApi<ModerationConfig>(guildId, "moderation/config", { skipCache: true });
      if (res.success && res.data) {
        const c = res.data;
        setConfig(c);
        setAutomodEnabled(c.automodEnabled);
        setLogChannelId(c.logChannelId ?? "");
        setPointDecayEnabled(c.pointDecayEnabled);
        setPointDecayDays(c.pointDecayDays);
        setDmOnInfraction(c.dmOnInfraction);
        setDefaultDmTemplate(c.defaultDmTemplate ?? "");
        setDmMode(c.dmMode);
      }
      setLoading(false);
    })();
  }, [guildId]);

  async function handleSave() {
    setSaving(true);
    const res = await fetchApi<ModerationConfig>(guildId, "moderation/config", {
      method: "PUT",
      body: JSON.stringify({
        automodEnabled,
        logChannelId: logChannelId || undefined,
        pointDecayEnabled,
        pointDecayDays,
        dmOnInfraction,
        defaultDmTemplate: defaultDmTemplate || undefined,
        dmMode,
      }),
    });
    if (res.success) {
      toast.success("Settings saved");
      if (res.data) setConfig(res.data);
    } else {
      toast.error(res.error?.message ?? "Failed to save settings");
    }
    setSaving(false);
  }

  if (loading) return <Spinner />;
  if (!config) return <p className="text-zinc-400">Failed to load config.</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>General Settings</CardTitle>
        <CardContent>
          <div className="space-y-4">
            <Toggle label="Enable Automod" description="Toggle automatic message filtering" checked={automodEnabled} onChange={setAutomodEnabled} disabled={!canManage} />

            <TextInput label="Fallback Log Channel ID" value={logChannelId} onChange={setLogChannelId} placeholder="Channel ID (used if logging plugin not configured)" disabled={!canManage} />

            <Toggle label="Point Decay" description="Automatically expire infraction points after a set period" checked={pointDecayEnabled} onChange={setPointDecayEnabled} disabled={!canManage} />

            {pointDecayEnabled && <TextInput label="Decay Period (days)" value={String(pointDecayDays)} onChange={(v) => setPointDecayDays(parseInt(v) || 30)} type="number" disabled={!canManage} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardTitle>DM Notifications</CardTitle>
        <CardContent>
          <div className="space-y-4">
            <Toggle label="DM on Infraction" description="Send a DM to users when they receive an infraction" checked={dmOnInfraction} onChange={setDmOnInfraction} disabled={!canManage} />

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">DM Mode</label>
              <select
                value={dmMode}
                onChange={(e) => setDmMode(e.target.value)}
                disabled={!canManage}
                className="w-full rounded-md bg-zinc-800 border border-zinc-600 text-zinc-100 px-3 py-2 text-sm disabled:opacity-50">
                <option value="text">Plain Text</option>
                <option value="embed">Embed</option>
                <option value="both">Both</option>
              </select>
            </div>

            <Textarea
              label="Default DM Template"
              value={defaultDmTemplate}
              onChange={setDefaultDmTemplate}
              placeholder="You received a {action} in {server} for: {reason}"
              rows={3}
              disabled={!canManage}
            />
            <p className="text-xs text-zinc-500">
              Variables: {"{server}"} {"{action}"} {"{reason}"} {"{points}"} {"{total_points}"} {"{duration}"} {"{moderator}"} {"{rule}"}
            </p>
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 text-sm font-medium disabled:opacity-50">
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
