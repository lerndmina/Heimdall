/**
 * Config tab — PlanetSide 2 plugin configuration.
 *
 * - No config → "Create" button → multi-step setup wizard.
 * - Config exists → read-only view → "Edit" button → edit wizard.
 * - Maps to GET/PUT /planetside/config.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import NumberInput from "@/components/ui/NumberInput";
import Toggle from "@/components/ui/Toggle";
import Combobox from "@/components/ui/Combobox";
import RoleCombobox from "@/components/ui/RoleCombobox";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import SetupWizard, { NotConfigured, EditButton, FieldDisplay, ReviewSection, ReviewRow, type WizardStep } from "@/components/ui/SetupWizard";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";

// ── Types ──────────────────────────────────────────────────────

interface PlanetSideConfig {
  guildId: string;
  enabled: boolean;
  outfitId: string;
  outfitTag: string;
  outfitName: string;
  censusServiceId: string;
  honuBaseUrl: string;
  verificationMethod: string;
  verificationWindowMinutes: number;
  roles: {
    member: string | null;
    guest: string | null;
    promotion: string | null;
  };
  channels: {
    log: string | null;
    censusStatus: string | null;
    panel: string | null;
  };
  enableAutoRevoke: boolean;
  enableAutoRestore: boolean;
  populationSource: string;
  allowSelfUnlink: boolean;
  defaultDashboardTab: string;
  panel: {
    title: string;
    description: string;
    color: string;
    footerText: string;
    showAuthor: boolean;
    showTimestamp: boolean;
  };
}

const DEFAULT_CONFIG: Omit<PlanetSideConfig, "guildId"> = {
  enabled: true,
  outfitId: "",
  outfitTag: "",
  outfitName: "",
  censusServiceId: "",
  honuBaseUrl: "https://wt.honu.pw",
  verificationMethod: "online_now",
  verificationWindowMinutes: 30,
  roles: { member: null, guest: null, promotion: null },
  channels: { log: null, censusStatus: null, panel: null },
  enableAutoRevoke: false,
  enableAutoRestore: false,
  populationSource: "honu",
  allowSelfUnlink: true,
  defaultDashboardTab: "players",
  panel: {
    title: "",
    description: "",
    color: "",
    footerText: "",
    showAuthor: true,
    showTimestamp: true,
  },
};

// ── Component ──────────────────────────────────────────────────

export default function ConfigTab({ guildId }: { guildId: string }) {
  const [config, setConfig] = useState<PlanetSideConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [draft, setDraft] = useState<Omit<PlanetSideConfig, "guildId">>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const res = await fetchApi<PlanetSideConfig>(guildId, "planetside/config");
      if (res.success && res.data) {
        setConfig(res.data);
        setNotFound(false);
      } else if (res.error?.code === "NOT_FOUND") {
        setNotFound(true);
      } else if (res.error?.code === "FORBIDDEN" || res.error?.code === "UNAUTHORIZED") {
        setError("Access denied: You don't have permission to view configuration");
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

  useRealtimeEvent("planetside:updated", () => fetchConfig());

  // ── Save handler ──────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetchApi<PlanetSideConfig>(guildId, "planetside/config", {
        method: "PUT",
        body: JSON.stringify(draft),
      });

      if (res.success && res.data) {
        setConfig(res.data);
        setNotFound(false);
        setWizardOpen(false);
        setWizardStep(0);
      } else {
        setSaveError(res.error?.message ?? "Failed to save configuration");
      }
    } catch {
      setSaveError("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  };

  // ── Wizard openers ────────────────────────────────────────

  const openCreateWizard = () => {
    setDraft({ ...DEFAULT_CONFIG });
    setWizardStep(0);
    setSaveError(null);
    setWizardOpen(true);
  };

  const openEditWizard = () => {
    if (!config) return;
    const { guildId: _, ...rest } = config;
    setDraft({ ...DEFAULT_CONFIG, ...rest });
    setWizardStep(0);
    setSaveError(null);
    setWizardOpen(true);
  };

  // ── Loading / Error states ────────────────────────────────

  if (loading && !wizardOpen && !config && !notFound) {
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

  // ── Wizard overlay ────────────────────────────────────────

  if (wizardOpen) {
    const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

    const updateRoles = (key: keyof typeof draft.roles, value: string | null) => setDraft((d) => ({ ...d, roles: { ...d.roles, [key]: value } }));

    const updateChannels = (key: keyof typeof draft.channels, value: string | null) => setDraft((d) => ({ ...d, channels: { ...d.channels, [key]: value } }));

    const updatePanel = <K extends keyof typeof draft.panel>(key: K, value: (typeof draft.panel)[K]) => setDraft((d) => ({ ...d, panel: { ...d.panel, [key]: value } }));

    const wizardSteps: WizardStep[] = [
      {
        id: "outfit",
        label: "Outfit Details",
        content: <StepOutfit draft={draft} update={update} guildId={guildId} />,
        validate: () => true, // outfit info is optional
      },
      {
        id: "verification",
        label: "Verification",
        content: <StepVerification draft={draft} update={update} />,
      },
      {
        id: "roles",
        label: "Roles",
        content: <StepRoles draft={draft} updateRoles={updateRoles} guildId={guildId} />,
      },
      {
        id: "channels",
        label: "Channels",
        content: <StepChannels draft={draft} updateChannels={updateChannels} guildId={guildId} />,
      },
      {
        id: "panel",
        label: "Panel Appearance",
        content: <StepPanel draft={draft} updatePanel={updatePanel} />,
      },
      {
        id: "advanced",
        label: "Advanced",
        content: <StepAdvanced draft={draft} update={update} />,
      },
      {
        id: "review",
        label: "Review",
        content: <StepReview draft={draft} />,
      },
    ];

    return (
      <SetupWizard
        steps={wizardSteps}
        step={wizardStep}
        onStepChange={setWizardStep}
        onSave={handleSave}
        onCancel={() => {
          setWizardOpen(false);
          setWizardStep(0);
        }}
        saving={saving}
        saveError={saveError}
        isEdit={!!config}
      />
    );
  }

  // ── Not configured ────────────────────────────────────────

  if (notFound || !config) {
    return (
      <NotConfigured title="PlanetSide Integration" description="Set up PlanetSide 2 account linking, outfit verification, and Census API monitoring for your server." onSetup={openCreateWizard} />
    );
  }

  // ── Read-only display ─────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatusBadge variant={config.enabled ? "success" : "neutral"}>{config.enabled ? "Enabled" : "Disabled"}</StatusBadge>
        <EditButton onClick={openEditWizard} />
      </div>

      {/* Outfit */}
      <Card>
        <CardTitle>Outfit Details</CardTitle>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FieldDisplay label="Outfit Tag" value={config.outfitTag || "—"} />
            <FieldDisplay label="Outfit Name" value={config.outfitName || "—"} />
            <FieldDisplay label="Outfit ID" value={config.outfitId || "—"} />
          </div>
        </CardContent>
      </Card>

      {/* Verification */}
      <Card>
        <CardTitle>Verification</CardTitle>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldDisplay label="Method" value={config.verificationMethod === "online_now" ? "Online Now" : config.verificationMethod === "recent_login" ? "Recent Login" : "Manual"} />
            {config.verificationMethod === "recent_login" && <FieldDisplay label="Window" value={`${config.verificationWindowMinutes} minutes`} />}
          </div>
        </CardContent>
      </Card>

      {/* API */}
      <Card>
        <CardTitle>API Settings</CardTitle>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldDisplay label="Honu Base URL" value={config.honuBaseUrl || "—"} />
            <FieldDisplay label="Census Service ID" value={config.censusServiceId ? "••••••" : "Not set"} />
            <FieldDisplay label="Population Source" value={config.populationSource === "honu" ? "Honu (primary)" : "Fisu"} />
          </div>
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardTitle>Roles</CardTitle>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FieldDisplay label="Member Role" value={config.roles.member ? `<@&${config.roles.member}>` : "Not set"} />
            <FieldDisplay label="Guest Role" value={config.roles.guest ? `<@&${config.roles.guest}>` : "Not set"} />
            <FieldDisplay label="Promotion Role" value={config.roles.promotion ? `<@&${config.roles.promotion}>` : "Not set"} />
          </div>
        </CardContent>
      </Card>

      {/* Channels */}
      <Card>
        <CardTitle>Channels</CardTitle>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FieldDisplay label="Log Channel" value={config.channels.log ? `<#${config.channels.log}>` : "Not set"} />
            <FieldDisplay label="Census Status" value={config.channels.censusStatus ? `<#${config.channels.censusStatus}>` : "Not set"} />
            <FieldDisplay label="Panel Channel" value={config.channels.panel ? `<#${config.channels.panel}>` : "Not set"} />
          </div>
        </CardContent>
      </Card>

      {/* Panel Appearance */}
      <Card>
        <CardTitle>Panel Appearance</CardTitle>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldDisplay label="Title" value={config.panel?.title || "Get your role! (default)"} />
            <FieldDisplay label="Color" value={config.panel?.color || "#de3b79 (default)"} />
            <FieldDisplay label="Footer" value={config.panel?.footerText || "Auto-generated (default)"} />
            <FieldDisplay label="Show Author" value={config.panel?.showAuthor !== false ? "Yes" : "No"} />
            <FieldDisplay label="Show Timestamp" value={config.panel?.showTimestamp !== false ? "Yes" : "No"} />
          </div>
          {config.panel?.description && (
            <div className="mt-4">
              <FieldDisplay label="Custom Description" value={config.panel.description} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave & Misc */}
      <Card>
        <CardTitle>Leave Handling & Options</CardTitle>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldDisplay label="Auto Revoke on Leave" value={config.enableAutoRevoke ? "Yes" : "No"} />
            <FieldDisplay label="Restore on Rejoin" value={config.enableAutoRestore ? "Yes" : "No"} />
            <FieldDisplay label="Allow Self-Unlink" value={config.allowSelfUnlink ? "Yes" : "No"} />
            <FieldDisplay label="Default Dashboard Tab" value={config.defaultDashboardTab?.charAt(0).toUpperCase() + config.defaultDashboardTab?.slice(1) || "Players"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WIZARD STEPS
// ═══════════════════════════════════════════════════════════════

function StepOutfit({
  draft,
  update,
  guildId,
}: {
  draft: Omit<PlanetSideConfig, "guildId">;
  update: <K extends keyof Omit<PlanetSideConfig, "guildId">>(key: K, value: Omit<PlanetSideConfig, "guildId">[K]) => void;
  guildId: string;
}) {
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupSuccess, setLookupSuccess] = useState<string | null>(null);

  const handleLookup = async () => {
    const tag = draft.outfitTag.trim();
    if (!tag) {
      setLookupError("Enter an outfit tag first.");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setLookupSuccess(null);

    try {
      const res = await fetchApi<{
        id: string;
        name: string;
        tag: string;
        factionID: number;
        worldID: number;
        memberCount: number | null;
      }>(guildId, `planetside/outfit-lookup?tag=${encodeURIComponent(tag)}`);

      if (res.success && res.data) {
        update("outfitId", res.data.id);
        if (res.data.name) update("outfitName", res.data.name);
        if (res.data.tag) update("outfitTag", res.data.tag);
        const memberInfo = res.data.memberCount ? ` (${res.data.memberCount} members)` : "";
        setLookupSuccess(`Found: [${res.data.tag}] ${res.data.name}${memberInfo}`);
      } else {
        setLookupError(res.error?.message ?? "Outfit not found.");
      }
    } catch {
      setLookupError("Failed to connect to API.");
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Configure the PlanetSide 2 outfit that this server is associated with. This is used for account verification and outfit-specific features.</p>
      <Toggle label="Enable PlanetSide Integration" checked={draft.enabled} onChange={(v) => update("enabled", v)} />
      <TextInput
        label="Outfit Tag"
        value={draft.outfitTag}
        onChange={(v) => {
          update("outfitTag", v);
          setLookupSuccess(null);
          setLookupError(null);
        }}
        placeholder="e.g. KOTV"
      />
      <TextInput label="Outfit Name" value={draft.outfitName} onChange={(v) => update("outfitName", v)} placeholder="e.g. Keepers of the Vanu" />
      <div className="space-y-1.5">
        <TextInput
          label="Outfit ID (Census)"
          value={draft.outfitId}
          onChange={(v) => update("outfitId", v)}
          placeholder="Census outfit_id (optional)"
          description="The numeric outfit ID from Census API. Used for outfit membership checks."
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={lookupLoading || !draft.outfitTag.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {lookupLoading ? (
            <>
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Looking up…
            </>
          ) : (
            <>Fetch from Honu</>
          )}
        </button>
        {lookupSuccess && <p className="text-xs text-emerald-400">{lookupSuccess}</p>}
        {lookupError && <p className="text-xs text-red-400">{lookupError}</p>}
      </div>
    </div>
  );
}

function StepVerification({
  draft,
  update,
}: {
  draft: Omit<PlanetSideConfig, "guildId">;
  update: <K extends keyof Omit<PlanetSideConfig, "guildId">>(key: K, value: Omit<PlanetSideConfig, "guildId">[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Choose how players verify ownership of their PlanetSide 2 character.</p>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-400">Verification Method</label>
        <Combobox
          value={draft.verificationMethod}
          onChange={(v) => update("verificationMethod", v)}
          options={[
            { value: "online_now", label: "Online Now — Character must be online in-game" },
            { value: "recent_login", label: "Recent Login — Character must have logged in recently" },
            { value: "manual", label: "Manual — Staff must approve each link" },
          ]}
        />
      </div>
      {draft.verificationMethod === "recent_login" && (
        <NumberInput
          label="Verification Window (minutes)"
          value={draft.verificationWindowMinutes}
          onChange={(v) => update("verificationWindowMinutes", v)}
          min={5}
          max={1440}
          description="How recently the character must have logged in to pass verification."
        />
      )}
      <TextInput
        label="Honu Base URL"
        value={draft.honuBaseUrl}
        onChange={(v) => update("honuBaseUrl", v)}
        placeholder="https://wt.honu.pw"
        description="Base URL for the Honu real-time API. Leave default unless self-hosting."
      />
      <TextInput
        label="Census Service ID"
        value={draft.censusServiceId}
        onChange={(v) => update("censusServiceId", v)}
        placeholder="s:example"
        description="Daybreak Census API service ID. Get one at census.daybreakgames.com."
      />
    </div>
  );
}

function StepRoles({ draft, updateRoles, guildId }: { draft: Omit<PlanetSideConfig, "guildId">; updateRoles: (key: keyof PlanetSideConfig["roles"], value: string | null) => void; guildId: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Assign Discord roles automatically when players link their PlanetSide accounts.</p>
      <RoleCombobox
        label="Member Role"
        guildId={guildId}
        value={draft.roles.member ?? ""}
        onChange={(v) => updateRoles("member", v)}
        description="Assigned to outfit members when their account is verified."
      />
      <RoleCombobox
        label="Guest Role"
        guildId={guildId}
        value={draft.roles.guest ?? ""}
        onChange={(v) => updateRoles("guest", v)}
        description="Assigned to non-outfit players who link their account."
      />
      <RoleCombobox
        label="Promotion Role"
        guildId={guildId}
        value={draft.roles.promotion ?? ""}
        onChange={(v) => updateRoles("promotion", v)}
        description="Optional role for promoted outfit members."
      />
    </div>
  );
}

function StepChannels({
  draft,
  updateChannels,
  guildId,
}: {
  draft: Omit<PlanetSideConfig, "guildId">;
  updateChannels: (key: keyof PlanetSideConfig["channels"], value: string | null) => void;
  guildId: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Configure where PlanetSide events and status updates are posted.</p>
      <ChannelCombobox label="Log Channel" guildId={guildId} value={draft.channels.log ?? ""} onChange={(v) => updateChannels("log", v)} description="Account link/unlink events are logged here." />
      <ChannelCombobox
        label="Census Status Channel"
        guildId={guildId}
        value={draft.channels.censusStatus ?? ""}
        onChange={(v) => updateChannels("censusStatus", v)}
        description="Census/Honu API health updates are posted here."
      />
      <ChannelCombobox
        label="Account Panel Channel"
        guildId={guildId}
        value={draft.channels.panel ?? ""}
        onChange={(v) => updateChannels("panel", v)}
        description="Persistent panel where users can link/manage their account."
      />
    </div>
  );
}

function StepPanel({
  draft,
  updatePanel,
}: {
  draft: Omit<PlanetSideConfig, "guildId">;
  updatePanel: <K extends keyof PlanetSideConfig["panel"]>(key: K, value: PlanetSideConfig["panel"][K]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Customize how the linking panel embed looks in your server. Leave fields blank to use smart defaults.</p>
      <TextInput
        label="Panel Title"
        value={draft.panel.title}
        onChange={(v) => updatePanel("title", v)}
        placeholder="Get your role!"
        description='Title of the panel embed. Default: "Get your role!"'
      />
      <Textarea
        label="Custom Description"
        value={draft.panel.description}
        onChange={(v) => updatePanel("description", v)}
        placeholder="Hello recruit! Link your PlanetSide 2 account..."
        description="Supports placeholders: {memberRole}, {guestRole}, {outfitTag}, {outfitName}. Leave blank for auto-generated description."
        rows={4}
        maxLength={2000}
      />
      <TextInput label="Embed Color" value={draft.panel.color} onChange={(v) => updatePanel("color", v)} placeholder="#de3b79" description="Hex color for the embed accent. Default: #de3b79 (pink)." />
      <TextInput
        label="Footer Text"
        value={draft.panel.footerText}
        onChange={(v) => updatePanel("footerText", v)}
        placeholder="PlanetSide 2 • Account Linking"
        description="Custom footer text. Default: auto-generated from outfit info."
      />
      <Toggle label="Show Author" description="Display the bot's name and avatar as the embed author." checked={draft.panel.showAuthor} onChange={(v) => updatePanel("showAuthor", v)} />
      <Toggle label="Show Timestamp" description="Include a timestamp on the panel embed." checked={draft.panel.showTimestamp} onChange={(v) => updatePanel("showTimestamp", v)} />
    </div>
  );
}

function StepAdvanced({
  draft,
  update,
}: {
  draft: Omit<PlanetSideConfig, "guildId">;
  update: <K extends keyof Omit<PlanetSideConfig, "guildId">>(key: K, value: Omit<PlanetSideConfig, "guildId">[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Leave handling and other options.</p>
      <Toggle
        label="Auto Revoke on Leave"
        description="Automatically revoke linked accounts when member leaves the server."
        checked={draft.enableAutoRevoke}
        onChange={(v) => update("enableAutoRevoke", v)}
      />
      <Toggle
        label="Restore on Rejoin"
        description="Restore previously linked account and roles when member rejoins."
        checked={draft.enableAutoRestore}
        onChange={(v) => update("enableAutoRestore", v)}
      />
      <Toggle label="Allow Self-Unlink" description="Allow users to unlink their own account via the panel." checked={draft.allowSelfUnlink} onChange={(v) => update("allowSelfUnlink", v)} />
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-400">Population Source</label>
        <Combobox
          value={draft.populationSource}
          onChange={(v) => update("populationSource", v)}
          options={[
            { value: "honu", label: "Honu (recommended)" },
            { value: "fisu", label: "Fisu (fallback)" },
          ]}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-400">Default Dashboard Tab</label>
        <Combobox
          value={draft.defaultDashboardTab}
          onChange={(v) => update("defaultDashboardTab", v)}
          options={[
            { value: "players", label: "Players" },
            { value: "pending", label: "Pending Players" },
            { value: "config", label: "Configuration" },
            { value: "status", label: "API Status" },
          ]}
        />
      </div>
    </div>
  );
}

function StepReview({ draft }: { draft: Omit<PlanetSideConfig, "guildId"> }) {
  return (
    <div className="space-y-4">
      <ReviewSection title="Outfit Details">
        <ReviewRow label="Enabled" value={draft.enabled ? "Yes" : "No"} />
        <ReviewRow label="Outfit Tag" value={draft.outfitTag || "—"} />
        <ReviewRow label="Outfit Name" value={draft.outfitName || "—"} />
        <ReviewRow label="Outfit ID" value={draft.outfitId || "—"} />
      </ReviewSection>

      <ReviewSection title="Verification">
        <ReviewRow label="Method" value={draft.verificationMethod === "online_now" ? "Online Now" : draft.verificationMethod === "recent_login" ? "Recent Login" : "Manual"} />
        {draft.verificationMethod === "recent_login" && <ReviewRow label="Window" value={`${draft.verificationWindowMinutes} minutes`} />}
        <ReviewRow label="Honu Base URL" value={draft.honuBaseUrl || "—"} />
        <ReviewRow label="Census Service ID" value={draft.censusServiceId ? "Set" : "Not set"} />
      </ReviewSection>

      <ReviewSection title="Roles">
        <ReviewRow label="Member" value={draft.roles.member ? `Role set` : "Not set"} />
        <ReviewRow label="Guest" value={draft.roles.guest ? `Role set` : "Not set"} />
        <ReviewRow label="Promotion" value={draft.roles.promotion ? `Role set` : "Not set"} />
      </ReviewSection>

      <ReviewSection title="Channels">
        <ReviewRow label="Log" value={draft.channels.log ? "Set" : "Not set"} />
        <ReviewRow label="Census Status" value={draft.channels.censusStatus ? "Set" : "Not set"} />
        <ReviewRow label="Panel" value={draft.channels.panel ? "Set" : "Not set"} />
      </ReviewSection>

      <ReviewSection title="Leave Handling">
        <ReviewRow label="Auto Revoke" value={draft.enableAutoRevoke ? "Yes" : "No"} />
        <ReviewRow label="Restore on Rejoin" value={draft.enableAutoRestore ? "Yes" : "No"} />
        <ReviewRow label="Self-Unlink" value={draft.allowSelfUnlink ? "Yes" : "No"} />
      </ReviewSection>

      <ReviewSection title="Panel Appearance">
        <ReviewRow label="Title" value={draft.panel.title || "Get your role! (default)"} />
        <ReviewRow label="Color" value={draft.panel.color || "#de3b79 (default)"} />
        <ReviewRow label="Footer" value={draft.panel.footerText || "Auto-generated (default)"} />
        <ReviewRow label="Show Author" value={draft.panel.showAuthor ? "Yes" : "No"} />
        <ReviewRow label="Show Timestamp" value={draft.panel.showTimestamp ? "Yes" : "No"} />
        {draft.panel.description && <ReviewRow label="Custom Description" value="Set" />}
      </ReviewSection>
    </div>
  );
}
