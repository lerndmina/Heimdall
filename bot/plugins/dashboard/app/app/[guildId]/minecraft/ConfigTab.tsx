/**
 * Config tab — Minecraft plugin configuration.
 *
 * - No config → shows a "Create" button that opens a multi-step setup wizard.
 * - Config exists → read-only view with an "Edit" button that opens edit mode.
 * - Edit/Create both PUT to /minecraft/config.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import TextInput from "@/components/ui/TextInput";
import NumberInput from "@/components/ui/NumberInput";
import Toggle from "@/components/ui/Toggle";
import DayTimePicker from "@/components/ui/DayTimePicker";
import Combobox from "@/components/ui/Combobox";
import { fetchApi } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleMappingEntry {
  discordRoleId: string;
  discordRoleName: string;
  minecraftGroup: string;
  enabled: boolean;
}

interface MinecraftConfig {
  guildId: string;
  enabled: boolean;
  autoWhitelist: boolean;
  whitelistScheduleType: "immediate" | "delay" | "scheduled_day";
  whitelistDelayMinutes: number;
  whitelistScheduledDay: number;
  whitelistScheduledHour: number;
  serverName: string;
  serverIp: string;
  serverPort: number;
  rconEnabled: boolean;
  rconHost?: string;
  rconPort: number;
  rconPassword?: string | null;
  cacheTimeout: number;
  maxPlayersPerUser: number;
  requireDiscordLink: boolean;
  enableRoleSync: boolean;
  roleSyncMode: "off" | "on_join" | "rcon";
  roleMappings: RoleMappingEntry[];
  rconAddCommand: string;
  rconRemoveCommand: string;
  enableMinecraftPlugin: boolean;
  enableAutoRevoke: boolean;
  enableAutoRestore: boolean;
}

const DEFAULT_CONFIG: Omit<MinecraftConfig, "guildId"> = {
  enabled: true,
  autoWhitelist: false,
  whitelistScheduleType: "immediate",
  whitelistDelayMinutes: 0,
  whitelistScheduledDay: 0,
  whitelistScheduledHour: 0,
  serverName: "",
  serverIp: "",
  serverPort: 25565,
  rconEnabled: false,
  rconHost: "",
  rconPort: 25575,
  rconPassword: null,
  cacheTimeout: 300,
  maxPlayersPerUser: 1,
  requireDiscordLink: false,
  enableRoleSync: false,
  roleSyncMode: "off",
  roleMappings: [],
  rconAddCommand: "lp user {player} parent add {group}",
  rconRemoveCommand: "lp user {player} parent remove {group}",
  enableMinecraftPlugin: false,
  enableAutoRevoke: false,
  enableAutoRestore: false,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConfigTab({ guildId }: { guildId: string }) {
  const [config, setConfig] = useState<MinecraftConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wizard / edit state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [draft, setDraft] = useState<Omit<MinecraftConfig, "guildId">>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const res = await fetchApi<MinecraftConfig>(guildId, "minecraft/config");
      if (res.success && res.data) {
        setConfig(res.data);
        setNotFound(false);
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

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ------ Save handler ------
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body = { ...draft };
      // Don't send rconPassword if it wasn't changed (shows as ***)
      if (body.rconPassword === "***" || body.rconPassword === "") {
        delete body.rconPassword;
      }

      const res = await fetchApi<MinecraftConfig>(guildId, "minecraft/config", {
        method: "PUT",
        body: JSON.stringify(body),
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

  // ------ Open wizard for create ------
  const openCreateWizard = () => {
    setDraft({ ...DEFAULT_CONFIG });
    setWizardStep(0);
    setSaveError(null);
    setWizardOpen(true);
  };

  // ------ Open wizard for edit ------
  const openEditWizard = () => {
    if (!config) return;
    const { guildId: _, ...rest } = config;
    setDraft({ ...DEFAULT_CONFIG, ...rest, rconPassword: rest.rconPassword ?? "" });
    setWizardStep(0);
    setSaveError(null);
    setWizardOpen(true);
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

  // ====== Wizard overlay ======
  if (wizardOpen) {
    return (
      <ConfigWizard
        guildId={guildId}
        draft={draft}
        setDraft={setDraft}
        step={wizardStep}
        setStep={setWizardStep}
        saving={saving}
        saveError={saveError}
        onSave={handleSave}
        onCancel={() => setWizardOpen(false)}
        isEdit={!notFound && !!config}
      />
    );
  }

  // ====== No config — show create prompt ======
  if (notFound || !config) {
    return (
      <Card className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-zinc-800 p-4">
          <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <CardTitle>No Minecraft Configuration</CardTitle>
        <CardDescription className="mt-2 max-w-md">Set up the Minecraft plugin to enable whitelist management, account linking, and server monitoring.</CardDescription>
        <button onClick={openCreateWizard} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Configuration
        </button>
      </Card>
    );
  }

  // ====== Read-only config display ======
  return (
    <div className="space-y-6">
      {/* Server Info */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Server Connection</CardTitle>
          <StatusBadge variant={config.enabled ? "success" : "neutral"}>{config.enabled ? "Enabled" : "Disabled"}</StatusBadge>
        </div>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Server Name" value={config.serverName || "—"} />
            <FieldDisplay label="Address" value={`${config.serverIp || "—"}:${config.serverPort ?? 25565}`} />
            <FieldDisplay label="Minecraft Plugin">
              <StatusBadge variant={config.enableMinecraftPlugin ? "success" : "neutral"}>{config.enableMinecraftPlugin ? "Connected" : "Not connected"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Cache Timeout" value={`${config.cacheTimeout ?? 300}s`} />
          </div>
        </CardContent>
      </Card>

      {/* Whitelist Settings */}
      <Card>
        <CardTitle>Whitelist Settings</CardTitle>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Whitelist Mode">
              <StatusBadge variant={config.autoWhitelist ? "success" : "warning"}>{config.autoWhitelist ? "Auto Whitelist" : "Staff Approval"}</StatusBadge>
            </FieldDisplay>
            {config.autoWhitelist && (
              <FieldDisplay
                label="Schedule"
                value={
                  config.whitelistScheduleType === "immediate"
                    ? "Immediately"
                    : config.whitelistScheduleType === "delay"
                      ? `After ${config.whitelistDelayMinutes} minute(s)`
                      : `Every ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][config.whitelistScheduledDay]} at ${String(Math.floor((config.whitelistScheduledHour ?? 0) / 60)).padStart(2, "0")}:${String((config.whitelistScheduledHour ?? 0) % 60).padStart(2, "0")} UTC`
                }
              />
            )}
            <FieldDisplay label="Require Discord Link">
              <StatusBadge variant={config.requireDiscordLink ? "success" : "neutral"}>{config.requireDiscordLink ? "Required" : "Not required"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Max Accounts Per User" value={String(config.maxPlayersPerUser ?? 10)} />
          </div>
        </CardContent>
      </Card>

      {/* Sync & RCON */}
      <Card>
        <CardTitle>Sync &amp; RCON</CardTitle>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Role Sync">
              <StatusBadge variant={config.enableRoleSync ? "success" : "neutral"}>
                {config.roleSyncMode === "rcon"
                  ? `RCON (${config.roleMappings?.length ?? 0} mapping${(config.roleMappings?.length ?? 0) === 1 ? "" : "s"})`
                  : config.roleSyncMode === "on_join"
                    ? `On Join (${config.roleMappings?.length ?? 0} mapping${(config.roleMappings?.length ?? 0) === 1 ? "" : "s"})`
                    : "Disabled"}
              </StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Auto Revoke on Leave">
              <StatusBadge variant={config.enableAutoRevoke ? "warning" : "neutral"}>{config.enableAutoRevoke ? "Enabled" : "Disabled"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Auto Restore on Rejoin">
              <StatusBadge variant={config.enableAutoRestore ? "success" : "neutral"}>{config.enableAutoRestore ? "Enabled" : "Disabled"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="RCON">
              <StatusBadge variant={config.rconEnabled ? "success" : "neutral"}>
                {config.rconEnabled ? `Enabled (${config.rconHost || config.serverIp || "—"}:${config.rconPort ?? 25575})` : "Disabled"}
              </StatusBadge>
            </FieldDisplay>
          </div>
        </CardContent>
      </Card>

      {/* Edit button */}
      <div className="flex justify-end">
        <button onClick={openEditWizard} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Edit Configuration
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Setup / Edit Wizard
// ===========================================================================

const STEPS = [
  { id: "server", label: "Server Details" },
  { id: "whitelist", label: "Whitelist" },
  { id: "advanced", label: "Advanced" },
  { id: "review", label: "Review" },
] as const;

interface WizardProps {
  guildId: string;
  draft: Omit<MinecraftConfig, "guildId">;
  setDraft: React.Dispatch<React.SetStateAction<Omit<MinecraftConfig, "guildId">>>;
  step: number;
  setStep: (s: number) => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  onCancel: () => void;
  isEdit: boolean;
}

function ConfigWizard({ guildId, draft, setDraft, step, setStep, saving, saveError, onSave, onCancel, isEdit }: WizardProps) {
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const canNext = () => {
    if (step === 0) return draft.serverName.trim() !== "" && draft.serverIp.trim() !== "";
    return true;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{isEdit ? "Edit Configuration" : "Setup Wizard"}</h2>
          <p className="text-sm text-zinc-400">
            Step {step + 1} of {STEPS.length} — {STEPS[step]!.label}
          </p>
        </div>
        <button onClick={onCancel} className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setStep(i)}
            disabled={i > step && !canNext()}
            className={`flex-1 rounded-full py-1 text-xs font-medium transition cursor-pointer ${
              i === step ? "bg-primary-600 text-white" : i < step ? "bg-primary-600/30 text-primary-400 hover:bg-primary-600/50" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
            } disabled:cursor-not-allowed disabled:opacity-50`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardContent>
          {step === 0 && <StepServer draft={draft} update={update} />}
          {step === 1 && <StepWhitelist draft={draft} update={update} />}
          {step === 2 && <StepAdvanced guildId={guildId} draft={draft} update={update} />}
          {step === 3 && <StepReview draft={draft} />}
        </CardContent>
      </Card>

      {/* Error */}
      {saveError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{saveError}</div>}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => (step === 0 ? onCancel() : setStep(step - 1))} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800">
          {step === 0 ? "Cancel" : "Back"}
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
            Continue
          </button>
        ) : (
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Configuration"}
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Wizard steps
// ===========================================================================

type UpdateFn = <K extends keyof Omit<MinecraftConfig, "guildId">>(key: K, value: Omit<MinecraftConfig, "guildId">[K]) => void;
type StepProps = { draft: Omit<MinecraftConfig, "guildId">; update: UpdateFn };

function StepServer({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label="Server Name"
          description="A friendly name for your Minecraft server"
          value={draft.serverName}
          onChange={(v) => update("serverName", v)}
          placeholder="My Minecraft Server"
          required
        />
        <TextInput label="Server IP" description="The IP address or hostname of your server" value={draft.serverIp} onChange={(v) => update("serverIp", v)} placeholder="play.example.com" required />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <NumberInput label="Server Port" description="Minecraft server port (default: 25565)" value={draft.serverPort} onChange={(v) => update("serverPort", v)} min={1} max={65535} />
      </div>
      <div className="border-t border-zinc-800 pt-5">
        <Toggle label="Enable" description="Enable the Minecraft configuration for this server" checked={draft.enabled} onChange={(v) => update("enabled", v)} />
      </div>
      <div>
        <Toggle
          label="Enable Minecraft Plugin"
          description="Enable if you have the Heimdall companion Java plugin installed on your MC server"
          checked={draft.enableMinecraftPlugin}
          onChange={(v) => update("enableMinecraftPlugin", v)}
        />
      </div>
    </div>
  );
}

function StepWhitelist({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <Toggle
        label="Auto Whitelist"
        description={draft.autoWhitelist ? "Players are whitelisted automatically based on the schedule below" : "Staff must manually approve each whitelist request"}
        checked={draft.autoWhitelist}
        onChange={(v) => update("autoWhitelist", v)}
      />

      {draft.autoWhitelist && (
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
          <p className="text-sm font-medium text-zinc-300">Whitelist Schedule</p>
          <div className="space-y-2">
            {(
              [
                { value: "immediate" as const, label: "Immediately", desc: "Whitelist as soon as they link their account" },
                { value: "delay" as const, label: "After a delay", desc: "Wait a set amount of time before whitelisting" },
                { value: "scheduled_day" as const, label: "On a scheduled day", desc: "Whitelist on the next occurrence of a chosen day" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  draft.whitelistScheduleType === opt.value ? "border-primary-500 bg-primary-600/10" : "border-zinc-700 hover:border-zinc-600"
                }`}>
                <input
                  type="radio"
                  name="whitelistSchedule"
                  checked={draft.whitelistScheduleType === opt.value}
                  onChange={() => update("whitelistScheduleType", opt.value)}
                  className="mt-0.5 accent-primary-500"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                  <p className="text-xs text-zinc-500">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {draft.whitelistScheduleType === "delay" && (
            <div className="pl-6">
              <NumberInput
                label="Delay (minutes)"
                description="How long to wait after registration before auto-whitelisting"
                value={draft.whitelistDelayMinutes}
                onChange={(v) => update("whitelistDelayMinutes", v)}
                min={1}
                max={10080}
              />
              {draft.whitelistDelayMinutes >= 60 && (
                <p className="mt-1 text-xs text-zinc-500">
                  ≈ {draft.whitelistDelayMinutes >= 1440 ? `${(draft.whitelistDelayMinutes / 1440).toFixed(1)} day(s)` : `${(draft.whitelistDelayMinutes / 60).toFixed(1)} hour(s)`}
                </p>
              )}
            </div>
          )}

          {draft.whitelistScheduleType === "scheduled_day" && (
            <div className="pl-6">
              <DayTimePicker
                label="Day & Time"
                description="Players registered before this day will be whitelisted on the next occurrence"
                day={draft.whitelistScheduledDay}
                timeMinutes={draft.whitelistScheduledHour}
                onDayChange={(v) => update("whitelistScheduledDay", v)}
                onTimeChange={(v) => update("whitelistScheduledHour", v)}
              />
            </div>
          )}
        </div>
      )}

      {!draft.autoWhitelist && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3 text-xs text-zinc-400">💡 With auto-whitelist off, all whitelist requests require manual staff approval.</div>
      )}

      <NumberInput
        label="Max Accounts Per User"
        description="Maximum number of Minecraft accounts a single Discord user can link (most servers use 1)"
        value={draft.maxPlayersPerUser}
        onChange={(v) => update("maxPlayersPerUser", v)}
        min={1}
        max={10}
      />
      {draft.maxPlayersPerUser > 1 && <p className="text-xs text-zinc-500">💡 Users will be able to manage their linked accounts via the Minecraft panel in Discord.</p>}
    </div>
  );
}

function StepAdvanced({ guildId, draft, update }: StepProps & { guildId: string }) {
  // Fetch guild roles when role sync is enabled
  const [guildRoles, setGuildRoles] = useState<{ id: string; name: string; color: string }[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  useEffect(() => {
    if (draft.roleSyncMode === "off") return;
    setRolesLoading(true);
    fetchApi<{ roles: { id: string; name: string; color: string }[] }>(guildId, "roles")
      .then((res) => {
        if (res.success && res.data) setGuildRoles(res.data.roles);
      })
      .finally(() => setRolesLoading(false));
  }, [draft.roleSyncMode, guildId]);

  const addMapping = () => {
    update("roleMappings", [...draft.roleMappings, { discordRoleId: "", discordRoleName: "", minecraftGroup: "", enabled: true }]);
  };

  const removeMapping = (index: number) => {
    update(
      "roleMappings",
      draft.roleMappings.filter((_, i) => i !== index),
    );
  };

  const updateMapping = (index: number, field: keyof RoleMappingEntry, value: string | boolean) => {
    const updated = [...draft.roleMappings];
    updated[index] = { ...updated[index]!, [field]: value };
    // When selecting a role, also store the name
    if (field === "discordRoleId") {
      const role = guildRoles.find((r) => r.id === value);
      if (role) updated[index]!.discordRoleName = role.name;
    }
    update("roleMappings", updated);
  };

  return (
    <div className="space-y-6">
      {/* Leave / Rejoin */}
      <div>
        <p className="mb-3 text-sm font-medium text-zinc-300">Leave &amp; Rejoin Behaviour</p>
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
          <Toggle
            label="Auto-Revoke on Server Leave"
            description="Revoke a player's whitelist when they leave the Discord server"
            checked={draft.enableAutoRevoke}
            onChange={(v) => update("enableAutoRevoke", v)}
          />
          <Toggle
            label="Auto-Restore on Rejoin"
            description="Restore a player's whitelist if they rejoin the Discord server"
            checked={draft.enableAutoRestore}
            onChange={(v) => update("enableAutoRestore", v)}
          />
        </div>
      </div>

      {/* Role Sync */}
      <div>
        <p className="mb-3 text-sm font-medium text-zinc-300">Role Sync</p>
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
          <div>
            <p className="text-sm font-medium text-zinc-200">Role Sync Mode</p>
            <p className="text-xs text-zinc-500 mb-3">Choose how Discord roles are synced to Minecraft permission groups</p>
            <div className="space-y-2">
              {[
                { value: "off" as const, label: "Disabled", desc: "No role synchronization" },
                { value: "on_join" as const, label: "On Join (Plugin)", desc: "The Java plugin syncs roles via LuckPerms when a player connects" },
                { value: "rcon" as const, label: "Immediately (RCON)", desc: "The bot sends RCON commands to sync roles as soon as Discord roles change" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    draft.roleSyncMode === opt.value ? "border-primary-500 bg-primary-600/10" : "border-zinc-700 hover:border-zinc-600"
                  }`}>
                  <input
                    type="radio"
                    name="roleSyncMode"
                    checked={draft.roleSyncMode === opt.value}
                    onChange={() => {
                      update("roleSyncMode", opt.value);
                      update("enableRoleSync", opt.value !== "off");
                      if (opt.value === "off") update("roleMappings", []);
                    }}
                    className="mt-0.5 accent-primary-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                    <p className="text-xs text-zinc-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {draft.roleSyncMode === "rcon" && !draft.rconEnabled && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              ⚠️ RCON must be enabled for immediate role sync. Enable RCON in the section below.
            </div>
          )}

          {/* Role Mapping Table */}
          {draft.roleSyncMode !== "off" && (
            <div className="space-y-3 pt-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-1">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Discord Role</p>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Minecraft Group</p>
                <div className="w-8" />
              </div>

              {/* Mappings */}
              {draft.roleMappings.map((mapping, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
                  {/* Discord Role Combobox */}
                  <Combobox
                    options={guildRoles.map((r) => ({ value: r.id, label: r.name }))}
                    value={mapping.discordRoleId}
                    onChange={(v) => updateMapping(i, "discordRoleId", v)}
                    placeholder="Select a role…"
                    searchPlaceholder="Search roles…"
                    emptyMessage="No roles found."
                    loading={rolesLoading}
                  />

                  {/* Minecraft Group Text Input */}
                  <input
                    type="text"
                    value={mapping.minecraftGroup}
                    onChange={(e) => updateMapping(i, "minecraftGroup", e.target.value)}
                    placeholder="e.g. vip, admin, member"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />

                  {/* Remove Button */}
                  <button
                    onClick={() => removeMapping(i)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
                    title="Remove mapping">
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
              ))}

              {/* Add Button */}
              <button
                onClick={addMapping}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-primary-500 hover:text-primary-400">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Role Mapping
              </button>

              {draft.roleMappings.length === 0 && <p className="text-xs text-zinc-500">No role mappings configured. Add one to map a Discord role to a Minecraft permission group.</p>}
            </div>
          )}

          {/* RCON Command Templates — only shown in RCON mode */}
          {draft.roleSyncMode === "rcon" && (
            <div className="space-y-3 pt-2 border-t border-zinc-700/50">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">RCON Command Templates</p>
              <p className="text-xs text-zinc-500">
                Use <code className="text-zinc-400">{"{player}"}</code> and <code className="text-zinc-400">{"{group}"}</code> as placeholders.
              </p>
              <TextInput
                label="Add Group Command"
                description="Command to add a permission group to a player"
                value={draft.rconAddCommand}
                onChange={(v) => update("rconAddCommand", v)}
                placeholder="lp user {player} parent add {group}"
              />
              <TextInput
                label="Remove Group Command"
                description="Command to remove a permission group from a player"
                value={draft.rconRemoveCommand}
                onChange={(v) => update("rconRemoveCommand", v)}
                placeholder="lp user {player} parent remove {group}"
              />
            </div>
          )}
        </div>
      </div>

      {/* RCON */}
      <div>
        <p className="mb-3 text-sm font-medium text-zinc-300">RCON</p>
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
          <Toggle label="Enable RCON" description="Allow the bot to send commands to the server via RCON" checked={draft.rconEnabled} onChange={(v) => update("rconEnabled", v)} />
          {draft.rconEnabled && (
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              <TextInput
                label="RCON Host"
                description="Leave blank to use the server IP"
                value={draft.rconHost ?? ""}
                onChange={(v) => update("rconHost", v)}
                placeholder={draft.serverIp || "Same as server IP"}
              />
              <NumberInput label="RCON Port" value={draft.rconPort} onChange={(v) => update("rconPort", v)} min={1} max={65535} />
              <TextInput label="RCON Password" type="password" value={String(draft.rconPassword ?? "")} onChange={(v) => update("rconPassword", v)} placeholder="••••••••" />
            </div>
          )}
        </div>
      </div>

      {/* Cache */}
      <NumberInput
        label="Cache Timeout (seconds)"
        description="How long to cache player lookups (60–3600)"
        value={draft.cacheTimeout}
        onChange={(v) => update("cacheTimeout", v)}
        min={60}
        max={3600}
      />
    </div>
  );
}

function StepReview({ draft }: { draft: Omit<MinecraftConfig, "guildId"> }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">Review your configuration before saving.</p>

      <div className="space-y-4">
        <ReviewSection title="Server">
          <ReviewRow label="Name" value={draft.serverName} />
          <ReviewRow label="Address" value={`${draft.serverIp}:${draft.serverPort}`} />
          <ReviewRow label="Plugin Enabled" value={draft.enabled ? "Yes" : "No"} />
          <ReviewRow label="MC Java Plugin" value={draft.enableMinecraftPlugin ? "Yes" : "No"} />
        </ReviewSection>

        <ReviewSection title="Whitelist">
          <ReviewRow label="Mode" value={draft.autoWhitelist ? "Auto Whitelist" : "Staff Approval"} />
          {draft.autoWhitelist && (
            <ReviewRow
              label="Schedule"
              value={
                draft.whitelistScheduleType === "immediate"
                  ? "Immediately"
                  : draft.whitelistScheduleType === "delay"
                    ? `After ${draft.whitelistDelayMinutes} minute(s)`
                    : `Every ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][draft.whitelistScheduledDay]} at ${String(Math.floor(draft.whitelistScheduledHour / 60)).padStart(2, "0")}:${String(draft.whitelistScheduledHour % 60).padStart(2, "0")} UTC`
              }
            />
          )}
          <ReviewRow label="Max Accounts/User" value={String(draft.maxPlayersPerUser)} />
        </ReviewSection>

        <ReviewSection title="Advanced">
          <ReviewRow label="Auto Revoke on Leave" value={draft.enableAutoRevoke ? "Yes" : "No"} />
          <ReviewRow label="Auto Restore on Rejoin" value={draft.enableAutoRestore ? "Yes" : "No"} />
          <ReviewRow
            label="Role Sync"
            value={
              draft.roleSyncMode === "rcon"
                ? `RCON — Immediate (${draft.roleMappings.length} mapping${draft.roleMappings.length === 1 ? "" : "s"})`
                : draft.roleSyncMode === "on_join"
                  ? `On Join — Plugin (${draft.roleMappings.length} mapping${draft.roleMappings.length === 1 ? "" : "s"})`
                  : "Disabled"
            }
          />
          {draft.roleSyncMode !== "off" && draft.roleMappings.length > 0 && (
            <div className="mt-2 space-y-1 rounded border border-zinc-700/50 bg-zinc-900/50 p-2">
              {draft.roleMappings.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{m.discordRoleName || "Unknown Role"}</span>
                  <span className="font-mono text-zinc-300">→ {m.minecraftGroup || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <ReviewRow label="RCON" value={draft.rconEnabled ? `${draft.rconHost || draft.serverIp}:${draft.rconPort}` : "Disabled"} />
          <ReviewRow label="Cache Timeout" value={`${draft.cacheTimeout}s`} />
        </ReviewSection>
      </div>
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-200">{value}</span>
    </div>
  );
}

function FieldDisplay({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-1">{children ?? <p className="text-sm text-zinc-200">{value ?? "—"}</p>}</div>
    </div>
  );
}
