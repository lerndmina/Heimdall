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
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import RoleCombobox from "@/components/ui/RoleCombobox";
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
  target: string[];
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
  wildcardPatterns?: string;
}

interface Preset {
  id: string;
  name: string;
  description: string;
  patterns: { regex: string; flags?: string; label?: string }[];
  wildcardPatterns?: string;
  target: string[];
  matchMode: "any" | "all";
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
  matchedContent?: string;
  matchedPattern?: string;
  channelId?: string;
  messageId?: string;
  pointsAssigned: number;
  totalPointsAfter: number;
  active: boolean;
  createdAt: string;
  // Enriched fields from API
  userUsername?: string;
  userDisplayName?: string;
  moderatorUsername?: string;
  moderatorDisplayName?: string;
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

// ── Shared label maps ────────────────────────────────────

const TARGET_OPTIONS = [
  { value: "message_content", label: "Message Content", description: "Scan message text" },
  { value: "message_emoji", label: "Message Emoji", description: "Scan emoji in messages" },
  { value: "reaction_emoji", label: "Reaction Emoji", description: "Scan emoji reactions" },
  { value: "username", label: "Username", description: "Scan usernames" },
  { value: "nickname", label: "Nickname", description: "Scan display names" },
  { value: "sticker", label: "Sticker", description: "Scan sticker names" },
  { value: "link", label: "Link", description: "Scan URLs in messages" },
] as const;

const ACTION_OPTIONS = [
  { value: "delete", label: "Delete Message", icon: "🗑️" },
  { value: "remove_reaction", label: "Remove Reaction", icon: "❌" },
  { value: "dm", label: "DM User", icon: "✉️" },
  { value: "warn", label: "Warn", icon: "⚠️" },
  { value: "timeout", label: "Timeout", icon: "⏱️" },
  { value: "kick", label: "Kick", icon: "👢" },
  { value: "ban", label: "Ban", icon: "🔨" },
  { value: "log", label: "Log", icon: "📋" },
] as const;

// ── Confirmation Dialog ──────────────────────────────────

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: { open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 rounded-md border border-zinc-600 hover:border-zinc-500">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-500 font-medium">
            Confirm
          </button>
        </div>
      }>
      <p className="text-sm text-zinc-300">{message}</p>
    </Modal>
  );
}

// ── Rules Tab ────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

interface WildcardTestResult {
  wildcard: string;
  matched: boolean;
  label: string;
}

function RulesTab({ guildId, canManage }: { guildId: string; canManage: boolean }) {
  const [rules, setRules] = useState<AutomodRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<AutomodRule | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // ── Wizard state ──
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  // Step 1: Basics
  const [name, setName] = useState("");

  // Step 2: Patterns
  const [wildcardText, setWildcardText] = useState("");
  const [patternsText, setPatternsText] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testResults, setTestResults] = useState<WildcardTestResult[]>([]);
  const [testMatched, setTestMatched] = useState<boolean | null>(null);

  // Step 3: Target + Actions
  const [target, setTarget] = useState<string[]>(["message_content"]);
  const [actions, setActions] = useState<string[]>(["delete", "warn", "log"]);
  const [warnPoints, setWarnPoints] = useState(1);
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [dmTemplate, setDmTemplate] = useState("");

  // Step 4: Scoping
  const [channelInclude, setChannelInclude] = useState<string[]>([]);
  const [channelExclude, setChannelExclude] = useState<string[]>([]);
  const [roleInclude, setRoleInclude] = useState<string[]>([]);
  const [roleExclude, setRoleExclude] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);

  // ── Confirmation dialog ──
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRule, setConfirmRule] = useState<AutomodRule | null>(null);

  // ── Expanded rule details ──
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    const res = await fetchApi<{ rules: AutomodRule[]; total: number }>(guildId, "moderation/rules", { skipCache: true });
    if (res.success && res.data) setRules(res.data.rules);
    setLoading(false);
  }, [guildId]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  function resetWizard() {
    setWizardStep(1);
    setName("");
    setWildcardText("");
    setPatternsText("");
    setTestInput("");
    setTestResults([]);
    setTestMatched(null);
    setTarget(["message_content"]);
    setActions(["delete", "warn", "log"]);
    setWarnPoints(1);
    setMatchMode("any");
    setDmTemplate("");
    setChannelInclude([]);
    setChannelExclude([]);
    setRoleInclude([]);
    setRoleExclude([]);
    setEditRule(null);
  }

  function openCreate() {
    resetWizard();
    setModalOpen(true);
  }

  function openEdit(rule: AutomodRule) {
    resetWizard();
    setEditRule(rule);
    setName(rule.name);

    // Restore original wildcard patterns if stored, and show only non-wildcard regex in the regex field
    if (rule.wildcardPatterns) {
      setWildcardText(rule.wildcardPatterns);
      // Filter out wildcard-generated patterns (those with labels) — show only raw regex
      const rawRegexPatterns = rule.patterns.filter((p) => !p.label);
      setPatternsText(rawRegexPatterns.map((p) => p.regex).join("\n"));
    } else {
      setWildcardText("");
      setPatternsText(rule.patterns.map((p) => p.regex).join("\n"));
    }
    setTarget(Array.isArray(rule.target) ? rule.target : [rule.target]);
    setActions(rule.actions);
    setWarnPoints(rule.warnPoints);
    setMatchMode(rule.matchMode);
    setDmTemplate(rule.dmTemplate ?? "");
    setChannelInclude(rule.channelInclude ?? []);
    setChannelExclude(rule.channelExclude ?? []);
    setRoleInclude(rule.roleInclude ?? []);
    setRoleExclude(rule.roleExclude ?? []);
    setWizardStep(1);
    setModalOpen(true);
  }

  async function handleTestWildcard() {
    if (!wildcardText.trim() || !testInput.trim()) return;

    const res = await fetchApi<{ matched: boolean; results: WildcardTestResult[]; errors: string[] }>(guildId, "moderation/rules/test-wildcard", {
      method: "POST",
      body: JSON.stringify({ wildcardPatterns: wildcardText, testContent: testInput }),
    });

    if (res.success && res.data) {
      setTestResults(res.data.results);
      setTestMatched(res.data.matched);
    } else {
      toast.error(res.error?.message ?? "Test failed");
    }
  }

  async function handleTestRegex() {
    if (!patternsText.trim() || !testInput.trim()) return;

    const patterns = patternsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((regex) => ({ regex, flags: "i" }));

    const res = await fetchApi<{ matched: boolean; matchedPattern?: { regex: string; label: string; match: string } }>(guildId, "moderation/rules/test", {
      method: "POST",
      body: JSON.stringify({ patterns, matchMode, testContent: testInput }),
    });

    if (res.success && res.data) {
      setTestMatched(res.data.matched);
      setTestResults([]);
    } else {
      toast.error(res.error?.message ?? "Test failed");
    }
  }

  async function handleSave() {
    setSaving(true);

    const body: Record<string, any> = {
      name,
      matchMode,
      target,
      actions,
      warnPoints,
    };

    if (dmTemplate.trim()) body.dmTemplate = dmTemplate;
    if (channelInclude.length > 0) body.channelInclude = channelInclude;
    if (channelExclude.length > 0) body.channelExclude = channelExclude;
    if (roleInclude.length > 0) body.roleInclude = roleInclude;
    if (roleExclude.length > 0) body.roleExclude = roleExclude;

    // Send both wildcard and regex — API merges them
    if (wildcardText.trim()) {
      body.wildcardPatterns = wildcardText;
    }
    const regexLines = patternsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (regexLines.length > 0) {
      body.patterns = regexLines.map((regex) => ({ regex }));
    }

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

  function handleDelete(rule: AutomodRule) {
    setConfirmRule(rule);
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!confirmRule) return;
    setConfirmOpen(false);
    const res = await fetchApi(guildId, `moderation/rules/${confirmRule._id}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Rule deleted");
      loadRules();
    } else {
      toast.error("Failed to delete rule");
    }
    setConfirmRule(null);
  }

  function toggleAction(action: string) {
    setActions((prev) => (prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]));
  }

  // ── Validation per-step ──
  const step1Valid = name.trim().length > 0;
  const step2Valid = wildcardText.trim().length > 0 || patternsText.trim().length > 0;
  const step3Valid = actions.length > 0 && target.length > 0;

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
                        {(Array.isArray(rule.target) ? rule.target : [rule.target]).map((t) => TARGET_OPTIONS.find((o) => o.value === t)?.label ?? t).join(", ")} · {rule.patterns.length} pattern
                        {rule.patterns.length !== 1 ? "s" : ""} · {rule.actions.join(", ")} · {rule.warnPoints} pts
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Toggle label="Enabled" checked={rule.enabled} onChange={() => handleToggle(rule)} />
                      <button onClick={() => setExpandedRuleId(expandedRuleId === rule._id ? null : rule._id)} className="text-sm text-zinc-400 hover:text-zinc-200">
                        {expandedRuleId === rule._id ? "Hide" : "Details"}
                      </button>
                      <button onClick={() => openEdit(rule)} className="text-sm text-zinc-400 hover:text-zinc-200">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(rule)} className="text-sm text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {expandedRuleId === rule._id && (
                  <div className="mt-3 pt-3 border-t border-zinc-700/50 space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">
                        Target: {(Array.isArray(rule.target) ? rule.target : [rule.target]).map((t) => TARGET_OPTIONS.find((o) => o.value === t)?.label ?? t).join(", ")}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">Match: {rule.matchMode === "all" ? "All patterns" : "Any pattern"}</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">Points: {rule.warnPoints}</span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      <span className="font-medium text-zinc-300">Actions:</span> {rule.actions.map((a) => ACTION_OPTIONS.find((o) => o.value === a)?.label ?? a).join(", ")}
                    </div>
                    {(rule.channelInclude.length > 0 || rule.channelExclude.length > 0 || rule.roleInclude.length > 0 || rule.roleExclude.length > 0) && (
                      <div className="text-xs text-zinc-400 space-y-0.5">
                        {rule.channelInclude.length > 0 && (
                          <div>
                            <span className="text-zinc-300">Channels (include):</span> {rule.channelInclude.length} channel(s)
                          </div>
                        )}
                        {rule.channelExclude.length > 0 && (
                          <div>
                            <span className="text-zinc-300">Channels (exclude):</span> {rule.channelExclude.length} channel(s)
                          </div>
                        )}
                        {rule.roleInclude.length > 0 && (
                          <div>
                            <span className="text-zinc-300">Roles (include):</span> {rule.roleInclude.length} role(s)
                          </div>
                        )}
                        {rule.roleExclude.length > 0 && (
                          <div>
                            <span className="text-zinc-300">Roles (exclude):</span> {rule.roleExclude.length} role(s)
                          </div>
                        )}
                      </div>
                    )}
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-zinc-300">Patterns ({rule.patterns.length}):</span>
                      {rule.patterns.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-zinc-800/60 rounded px-2 py-1.5">
                          <code className="text-amber-400/80 break-all font-mono">
                            /{p.regex}/{p.flags ?? "i"}
                          </code>
                          {p.label && <span className="text-zinc-500 shrink-0">— {p.label}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Rule Wizard Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRule ? "Edit Rule" : "New Rule"} maxWidth="max-w-2xl">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {([1, 2, 3, 4] as WizardStep[]).map((step) => (
            <div key={step} className="flex items-center gap-2 flex-1">
              <button
                onClick={() => {
                  // Allow going back to completed steps
                  if (step < wizardStep || (step === 2 && step1Valid) || (step === 3 && step1Valid && step2Valid) || (step === 4 && step1Valid && step2Valid && step3Valid)) {
                    setWizardStep(step);
                  }
                }}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all ${
                  wizardStep === step ? "bg-indigo-600 text-white ring-2 ring-indigo-400/30" : wizardStep > step ? "bg-green-600/80 text-white cursor-pointer" : "bg-zinc-700 text-zinc-400"
                }`}>
                {wizardStep > step ? "✓" : step}
              </button>
              {step < 4 && <div className={`flex-1 h-0.5 rounded ${wizardStep > step ? "bg-green-600/60" : "bg-zinc-700"}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mb-4 text-[10px] text-zinc-500">
          <span className="w-1/4 text-center">Name</span>
          <span className="w-1/4 text-center">Patterns</span>
          <span className="w-1/4 text-center">Behaviour</span>
          <span className="w-1/4 text-center">Scoping</span>
        </div>

        {/* ── Step 1: Name ── */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <TextInput label="Rule Name" description="A unique identifier for this rule" value={name} onChange={setName} placeholder="e.g. slur-filter, meme-blocker" required />

            <div className="flex justify-end">
              <button
                onClick={() => setWizardStep(2)}
                disabled={!step1Valid}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Patterns (both wildcard + regex) ── */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">Add patterns using simple wildcards, regex, or both. At least one pattern is required.</p>

            {/* Wildcard section */}
            <div className="bg-zinc-800/30 rounded-lg p-3 space-y-2 border border-zinc-700/40">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-zinc-200">Simple Patterns</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">Easy</span>
              </div>
              <p className="text-xs text-zinc-500">
                Separate with commas or one per line. Use <code className="text-amber-400/70">*</code> to match any characters.
              </p>
              <Textarea label="" value={wildcardText} onChange={setWildcardText} placeholder={"*m*m, d*d, exact-word\n*bad*\nsl*r\n*hate*"} rows={2} />

              {/* Pattern guide (collapsed) */}
              <details className="text-xs">
                <summary className="text-zinc-400 cursor-pointer hover:text-zinc-300">Pattern guide</summary>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-zinc-400">
                  <div>
                    <code className="text-amber-400/70">word</code> — exact match
                  </div>
                  <div>
                    <code className="text-amber-400/70">*word</code> — ends with &quot;word&quot;
                  </div>
                  <div>
                    <code className="text-amber-400/70">word*</code> — starts with &quot;word&quot;
                  </div>
                  <div>
                    <code className="text-amber-400/70">*word*</code> — contains &quot;word&quot;
                  </div>
                  <div>
                    <code className="text-amber-400/70">*w*rd</code> — inner wildcard
                  </div>
                  <div>
                    <code className="text-amber-400/70">a, b, c</code> — multiple patterns
                  </div>
                </div>
              </details>
            </div>

            {/* Regex section */}
            <div className="bg-zinc-800/30 rounded-lg p-3 space-y-2 border border-zinc-700/40">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-zinc-200">Regex Patterns</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Advanced</span>
              </div>
              <Textarea
                label=""
                description="One regular expression per line. Flags default to case-insensitive (i)."
                value={patternsText}
                onChange={setPatternsText}
                placeholder={"\\bslur1\\b\n\\bslur2\\b\n<a?:emote_name:\\d+>"}
                rows={2}
              />
            </div>

            {/* Live test — tests combined */}
            <div className="bg-zinc-800/40 rounded-lg p-3 space-y-2 border border-zinc-700/50">
              <p className="text-xs font-medium text-zinc-300">Live Test</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder="Type a test message…"
                    className="w-full rounded-md border border-zinc-700 bg-white/5 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={wildcardText.trim() ? handleTestWildcard : handleTestRegex}
                  disabled={(!wildcardText.trim() && !patternsText.trim()) || !testInput.trim()}
                  className="px-3 py-1.5 bg-zinc-700 text-zinc-200 rounded-md text-sm hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed">
                  Test
                </button>
              </div>
              {testMatched !== null && (
                <div className={`text-sm font-medium ${testMatched ? "text-red-400" : "text-green-400"}`}>
                  {testMatched ? "⚠ Matched — this message would be caught" : "✓ No match — this message would pass"}
                </div>
              )}
              {testResults.length > 0 && (
                <div className="space-y-1">
                  {testResults.map((r, i) => (
                    <div key={i} className={`text-xs px-2 py-1 rounded ${r.matched ? "bg-red-500/10 text-red-300" : "bg-zinc-800 text-zinc-500"}`}>
                      <code className="text-amber-400/70">{r.wildcard}</code> → {r.label} {r.matched ? "— MATCHED" : "— no match"}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button onClick={() => setWizardStep(1)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                ← Back
              </button>
              <button
                onClick={() => setWizardStep(3)}
                disabled={!step2Valid}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Target, Actions, Points ── */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            {/* Target */}
            <div>
              <label className="block text-sm font-medium text-zinc-200 mb-2">
                Target <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-zinc-500 mb-2">What type of content should this rule scan? Select one or more.</p>
              <div className="grid grid-cols-2 gap-2">
                {TARGET_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTarget((prev) => (prev.includes(t.value) ? prev.filter((v) => v !== t.value) : [...prev, t.value]))}
                    className={`p-2.5 rounded-lg border text-left transition-all text-sm ${
                      target.includes(t.value) ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30" : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                    }`}>
                    <div className="font-medium text-zinc-100">{t.label}</div>
                    <div className="text-xs text-zinc-400">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div>
              <label className="block text-sm font-medium text-zinc-200 mb-2">
                Actions <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-zinc-500 mb-2">What should happen when this rule triggers? Select one or more.</p>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_OPTIONS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => toggleAction(a.value)}
                    className={`p-2 rounded-lg border text-left transition-all text-sm flex items-center gap-2 ${
                      actions.includes(a.value) ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30" : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                    }`}>
                    <span>{a.icon}</span>
                    <span className="text-zinc-100">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Per-rule DM Template (shown when DM or Warn action is selected) */}
            {(actions.includes("dm") || actions.includes("warn")) && (
              <div className="bg-zinc-800/30 rounded-lg p-3 space-y-2 border border-zinc-700/40">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-zinc-200">DM Message Template</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-600/40 text-zinc-400">Optional</span>
                </div>
                <p className="text-xs text-zinc-500">Override the default DM message for this rule. Leave blank to use the global default from Settings.</p>
                <Textarea
                  label=""
                  value={dmTemplate}
                  onChange={setDmTemplate}
                  placeholder="You violated the **{rule}** rule in **{server}**.\n\n**Reason:** {reason}\n**Points:** {points} (Total: {totalPoints})"
                  rows={3}
                />
                <details className="text-xs">
                  <summary className="text-zinc-400 cursor-pointer hover:text-zinc-300">Available variables</summary>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-zinc-400">
                    <div>
                      <code className="text-amber-400/70">{"{server}"}</code> — Server name
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{rule}"}</code> — Rule name
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{action}"}</code> — Action taken
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{reason}"}</code> — Reason text
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{points}"}</code> — Points assigned
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{totalPoints}"}</code> — Total active points
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{user}"}</code> — User mention
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{username}"}</code> — Username
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{channel}"}</code> — Channel mention
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{matchedContent}"}</code> — Matched text
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{duration}"}</code> — Timeout duration
                    </div>
                    <div>
                      <code className="text-amber-400/70">{"{timestamp}"}</code> — ISO timestamp
                    </div>
                  </div>
                </details>
              </div>
            )}

            {/* Match Mode + Warn Points */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-200 mb-1">Match Mode</label>
                <select
                  value={matchMode}
                  onChange={(e) => setMatchMode(e.target.value as "any" | "all")}
                  className="w-full rounded-lg border border-zinc-700 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                  <option value="any">Any pattern (OR)</option>
                  <option value="all">All patterns (AND)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-200 mb-1">Warn Points</label>
                <input
                  type="number"
                  value={warnPoints}
                  onChange={(e) => setWarnPoints(parseInt(e.target.value) || 0)}
                  min={0}
                  max={100}
                  className="w-full rounded-lg border border-zinc-700 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setWizardStep(2)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                ← Back
              </button>
              <button
                onClick={() => setWizardStep(4)}
                disabled={!step3Valid}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Scoping (optional) ── */}
        {wizardStep === 4 && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">Optionally restrict where this rule applies. Leave empty to apply everywhere.</p>

            <ChannelScopingSection guildId={guildId} title="Channel Include" description="Only apply in these channels (empty = all)" values={channelInclude} onChange={setChannelInclude} />
            <ChannelScopingSection guildId={guildId} title="Channel Exclude" description="Never apply in these channels" values={channelExclude} onChange={setChannelExclude} />
            <RoleScopingSection guildId={guildId} title="Role Include" description="Only apply to users with these roles (empty = all)" values={roleInclude} onChange={setRoleInclude} />
            <RoleScopingSection guildId={guildId} title="Role Exclude" description="Never apply to users with these roles (immune)" values={roleExclude} onChange={setRoleExclude} />

            {/* Summary */}
            <div className="bg-zinc-800/60 rounded-lg p-3 space-y-1.5 border border-zinc-700/50">
              <p className="text-xs font-medium text-zinc-300">Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400">
                <div>
                  <span className="text-zinc-300">Name:</span> {name}
                </div>
                <div>
                  <span className="text-zinc-300">Points:</span> {warnPoints}
                </div>
                <div>
                  <span className="text-zinc-300">Target:</span> {target.map((t) => TARGET_OPTIONS.find((o) => o.value === t)?.label ?? t).join(", ")}
                </div>
                <div>
                  <span className="text-zinc-300">Match:</span> {matchMode === "all" ? "All patterns" : "Any pattern"}
                </div>
                <div className="col-span-2">
                  <span className="text-zinc-300">Actions:</span> {actions.map((a) => ACTION_OPTIONS.find((o) => o.value === a)?.label ?? a).join(", ")}
                </div>
                <div className="col-span-2">
                  <span className="text-zinc-300">Patterns:</span>{" "}
                  {[
                    wildcardText.trim() ? `${wildcardText.split(/[,\n]/).filter((s) => s.trim()).length} wildcard` : "",
                    patternsText.trim() ? `${patternsText.split("\n").filter(Boolean).length} regex` : "",
                  ]
                    .filter(Boolean)
                    .join(" + ")}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setWizardStep(3)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                ← Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !step1Valid || !step2Valid || !step3Valid}
                className="px-5 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? "Saving…" : editRule ? "Update Rule" : "Create Rule"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Rule"
        message={`Are you sure you want to delete the rule "${confirmRule?.name ?? ""}"? This cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmRule(null);
        }}
      />
    </div>
  );
}

/** Reusable channel scoping — pick channels via Combobox, add/remove */
function ChannelScopingSection({ guildId, title, description, values, onChange }: { guildId: string; title: string; description: string; values: string[]; onChange: (v: string[]) => void }) {
  function add(id: string) {
    if (id && !values.includes(id)) onChange([...values, id]);
  }

  function remove(id: string) {
    onChange(values.filter((v) => v !== id));
  }

  return (
    <div>
      <ChannelCombobox guildId={guildId} value="" onChange={(id) => add(id)} channelType="text" label={title} description={description} placeholder="Select a channel…" />
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-700 text-xs text-zinc-300">
              <span className="text-zinc-400">#</span>
              {v}
              <button onClick={() => remove(v)} className="text-zinc-500 hover:text-red-400">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Reusable role scoping — pick roles via Combobox, add/remove */
function RoleScopingSection({ guildId, title, description, values, onChange }: { guildId: string; title: string; description: string; values: string[]; onChange: (v: string[]) => void }) {
  function add(id: string) {
    if (id && !values.includes(id)) onChange([...values, id]);
  }

  function remove(id: string) {
    onChange(values.filter((v) => v !== id));
  }

  return (
    <div>
      <RoleCombobox guildId={guildId} value="" onChange={(id) => add(id)} excludeIds={values} label={title} description={description} placeholder="Select a role…" />
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-700 text-xs text-zinc-300">
              <span className="text-zinc-400">@</span>
              {v}
              <button onClick={() => remove(v)} className="text-zinc-500 hover:text-red-400">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Presets Tab ───────────────────────────────────────────

function PresetsTab({ guildId, canManage }: { guildId: string; canManage: boolean }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
              <div className="flex items-center gap-3">
                <span className={`text-sm ${preset.installed ? "text-green-400" : "text-zinc-500"}`}>{preset.installed ? "Installed" : "Not installed"}</span>
                <button onClick={() => setExpandedId(expandedId === preset.id ? null : preset.id)} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                  {expandedId === preset.id ? "Hide Preview" : "Preview"}
                </button>
              </div>
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

            {expandedId === preset.id &&
              (() => {
                const wildcards = preset.wildcardPatterns
                  ? preset.wildcardPatterns
                      .split(/[,\n]+/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : [];
                return (
                  <div className="mt-3 pt-3 border-t border-zinc-700/50 space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">
                        Target: {(Array.isArray(preset.target) ? preset.target : [preset.target]).map((t) => TARGET_OPTIONS.find((o) => o.value === t)?.label ?? t).join(", ")}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">Match: {preset.matchMode === "all" ? "All patterns" : "Any pattern"}</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">Points: {preset.warnPoints}</span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      <span className="font-medium text-zinc-300">Actions:</span> {preset.actions.map((a) => ACTION_OPTIONS.find((o) => o.value === a)?.label ?? a).join(", ")}
                    </div>
                    {wildcards.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-zinc-300">Wildcard Patterns ({wildcards.length}):</span>
                        <div className="flex flex-wrap gap-1.5">
                          {wildcards.map((w, i) => (
                            <span key={i} className="text-xs bg-zinc-800/60 rounded px-2 py-1 font-mono text-emerald-400/80">
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {preset.patterns.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-zinc-300">Regex Patterns ({preset.patterns.length}):</span>
                        {preset.patterns.map((p, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs bg-zinc-800/60 rounded px-2 py-1.5">
                            <code className="text-amber-400/80 break-all font-mono">
                              /{p.regex}/{p.flags ?? ""}
                            </code>
                            {p.label && <span className="text-zinc-500 shrink-0">— {p.label}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Escalation Tab ───────────────────────────────────────

/** Convert ms to a compact human-readable duration (e.g. 3600000 → "1h") */
function msToHumanDuration(ms: number | string | null | undefined): string {
  if (ms === null || ms === undefined || ms === "") return "";
  const n = typeof ms === "string" ? parseInt(ms, 10) : ms;
  if (isNaN(n) || n <= 0) return "";
  const units: [number, string][] = [
    [604_800_000, "w"],
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
    [1_000, "s"],
  ];
  for (const [div, label] of units) {
    if (n >= div && n % div === 0) return `${n / div}${label}`;
  }
  // Fallback: best-fit largest unit
  for (const [div, label] of units) {
    if (n >= div) return `${Math.round(n / div)}${label}`;
  }
  return `${n}ms`;
}

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
        setTiers(
          (res.data.escalationTiers ?? []).map((t: any) => ({
            ...t,
            duration: msToHumanDuration(t.duration),
          })),
        );
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

  // ── Confirmation dialog ──
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);

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

  function clearInfractions(userId: string) {
    setConfirmUserId(userId);
    setConfirmOpen(true);
  }

  async function confirmClear() {
    if (!confirmUserId) return;
    setConfirmOpen(false);
    const res = await fetchApi(guildId, `moderation/infractions/${confirmUserId}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Infractions cleared");
      loadInfractions();
    } else {
      toast.error("Failed to clear infractions");
    }
    setConfirmUserId(null);
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
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${inf.source === "automod" ? "bg-blue-900 text-blue-300" : "bg-purple-900 text-purple-300"}`}>{inf.source}</span>
                      <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">{inf.type}</span>
                      <span className={`text-xs ${inf.active ? "text-green-400" : "text-zinc-500"}`}>{inf.active ? "Active" : "Cleared"}</span>
                    </div>
                    <p className="text-sm text-zinc-200 mt-1.5">
                      {inf.userDisplayName ?? inf.userUsername ?? inf.userId}
                      {inf.userUsername && inf.userDisplayName && inf.userDisplayName !== inf.userUsername && <span className="text-zinc-500 ml-1">(@{inf.userUsername})</span>}
                      <span className="text-zinc-600 ml-1 text-xs font-mono">{inf.userId}</span>
                    </p>
                    {inf.moderatorId && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        By: {inf.moderatorDisplayName ?? inf.moderatorUsername ?? inf.moderatorId}
                        {inf.moderatorUsername && inf.moderatorDisplayName && inf.moderatorDisplayName !== inf.moderatorUsername && (
                          <span className="text-zinc-500 ml-1">(@{inf.moderatorUsername})</span>
                        )}
                      </p>
                    )}
                    {inf.ruleName && <p className="text-sm text-zinc-300 mt-1">Automod rule: {inf.ruleName}</p>}
                    <p className="text-sm text-zinc-400 mt-0.5">{inf.reason ?? "No reason"}</p>
                    {inf.matchedContent && (
                      <p className="text-xs text-zinc-500 mt-1 truncate max-w-md" title={inf.matchedContent}>
                        Matched:{" "}
                        <span className="text-zinc-400">
                          {inf.matchedContent.substring(0, 100)}
                          {inf.matchedContent.length > 100 ? "…" : ""}
                        </span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-zinc-500">
                      <span>
                        {inf.pointsAssigned} pts · Total: {inf.totalPointsAfter} pts
                      </span>
                      <span>·</span>
                      <span>{new Date(inf.createdAt).toLocaleString()}</span>
                      {inf.channelId && (
                        <>
                          <span>·</span>
                          <span className="text-zinc-400">#{inf.channelId}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {canManage && inf.active && (
                    <button onClick={() => clearInfractions(inf.userId)} className="text-sm text-red-400 hover:text-red-300 whitespace-nowrap">
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

      <ConfirmDialog
        open={confirmOpen}
        title="Clear Infractions"
        message={`Are you sure you want to clear all active infractions for user ${confirmUserId ?? ""}? This cannot be undone.`}
        onConfirm={confirmClear}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmUserId(null);
        }}
      />
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
            <details className="text-xs">
              <summary className="text-zinc-400 cursor-pointer hover:text-zinc-300">Available variables</summary>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-zinc-400">
                <div>
                  <code className="text-amber-400/70">{"{server}"}</code> — Server name
                </div>
                <div>
                  <code className="text-amber-400/70">{"{rule}"}</code> — Rule name
                </div>
                <div>
                  <code className="text-amber-400/70">{"{action}"}</code> — Action taken
                </div>
                <div>
                  <code className="text-amber-400/70">{"{reason}"}</code> — Reason text
                </div>
                <div>
                  <code className="text-amber-400/70">{"{points}"}</code> — Points assigned
                </div>
                <div>
                  <code className="text-amber-400/70">{"{totalPoints}"}</code> — Total active points
                </div>
                <div>
                  <code className="text-amber-400/70">{"{user}"}</code> — User mention
                </div>
                <div>
                  <code className="text-amber-400/70">{"{username}"}</code> — Username
                </div>
                <div>
                  <code className="text-amber-400/70">{"{channel}"}</code> — Channel mention
                </div>
                <div>
                  <code className="text-amber-400/70">{"{matchedContent}"}</code> — Matched text
                </div>
                <div>
                  <code className="text-amber-400/70">{"{duration}"}</code> — Timeout duration
                </div>
                <div>
                  <code className="text-amber-400/70">{"{timestamp}"}</code> — ISO timestamp
                </div>
              </div>
            </details>
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
