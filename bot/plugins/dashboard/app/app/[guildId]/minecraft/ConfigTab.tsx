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
import Textarea from "@/components/ui/Textarea";
import DayTimePicker from "@/components/ui/DayTimePicker";
import Combobox from "@/components/ui/Combobox";
import SetupWizard, { NotConfigured, EditButton, FieldDisplay, ReviewSection, ReviewRow, type WizardStep } from "@/components/ui/SetupWizard";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";

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
  defaultDashboardTab: "players" | "pending" | "config" | "status";
  // Customisable kick/auth messages (Minecraft formatting codes)
  authSuccessMessage: string;
  authPendingMessage: string;
  authRejectionMessage: string;
  applicationRejectionMessage: string;
  whitelistRevokedMessage: string;
  whitelistPendingApprovalMessage: string;
  whitelistPendingScheduledMessage: string;
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
  defaultDashboardTab: "players",
  authSuccessMessage: "§aWelcome back, {player}!",
  authPendingMessage: "§eYour authentication code is: §6{code}\n§7Go back to Discord and click §fConfirm Code §7to complete linking.",
  authRejectionMessage: "§cTo join this server:\n§7• Join the Discord server\n§7• Use §f/link-minecraft {username}\n§7• Follow the instructions to link your account",
  applicationRejectionMessage: "§cYour whitelist application has been rejected.\n§7Please contact staff for more information.",
  whitelistRevokedMessage: "§cYour whitelist has been revoked{reason}.\n§7Please contact staff for more information.",
  whitelistPendingApprovalMessage: "§eYour whitelist application is pending staff approval.\n§7Please wait for a staff member to review your request.",
  whitelistPendingScheduledMessage: "§eYou will be whitelisted {schedule}.\n§7Please check back later!",
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
      } else if (res.error?.code === "FORBIDDEN" || res.error?.code === "UNAUTHORIZED" || res.error?.message?.toLowerCase().includes("permission")) {
        setError("Access denied: You don't have permission to view server configuration");
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

  useRealtimeEvent("minecraft:updated", () => {
    fetchConfig();
  });

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
  if (loading && !wizardOpen && !config && !notFound) {
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
    const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

    const wizardSteps: WizardStep[] = [
      {
        id: "server",
        label: "Server Details",
        content: <StepServer draft={draft} update={update} />,
        validate: () => draft.serverName.trim() !== "" && draft.serverIp.trim() !== "",
      },
      {
        id: "whitelist",
        label: "Whitelist",
        content: <StepWhitelist draft={draft} update={update} />,
      },
      {
        id: "messages",
        label: "Messages",
        content: <StepMessages draft={draft} update={update} />,
      },
      {
        id: "advanced",
        label: "Advanced",
        content: <StepAdvanced guildId={guildId} draft={draft} update={update} />,
        validate: () => {
          const hasIncompleteMapping = draft.roleMappings.some((m) => !m.discordRoleId || !m.minecraftGroup.trim());
          if (hasIncompleteMapping) return false;
          if (draft.roleSyncMode === "rcon") {
            if (!draft.rconEnabled) return false;
            if (!draft.rconPassword || draft.rconPassword === "") return false;
            if (draft.rconPort < 1 || draft.rconPort > 65535) return false;
          }
          return true;
        },
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
        isEdit={!notFound && !!config}
        saving={saving}
        saveError={saveError}
        onSave={handleSave}
        onCancel={() => setWizardOpen(false)}
      />
    );
  }

  // ====== No config — show create prompt ======
  if (notFound || !config) {
    return (
      <NotConfigured title="No Minecraft Configuration" description="Set up the Minecraft plugin to enable whitelist management, account linking, and server monitoring." onSetup={openCreateWizard} />
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
            <FieldDisplay label="Default Dashboard Tab">
              <StatusBadge variant="neutral">
                {config.defaultDashboardTab === "pending"
                  ? "Pending"
                  : config.defaultDashboardTab === "config"
                    ? "Configuration"
                    : config.defaultDashboardTab === "status"
                      ? "Server Status"
                      : "Players"}
              </StatusBadge>
            </FieldDisplay>
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      <Card>
        <CardTitle>Messages</CardTitle>
        <CardDescription>Customise the messages shown to players when they connect to the Minecraft server.</CardDescription>
        <CardContent>
          <div className="mt-4 grid gap-4">
            <FieldDisplay label="Welcome Back (Whitelisted)" value={config.authSuccessMessage || "§aWelcome back, {player}!"} />
            <FieldDisplay label="Auth Code Shown" value={config.authPendingMessage || "(default)"} />
            <FieldDisplay label="Not Linked / Rejected" value={config.authRejectionMessage || "(default)"} />
            <FieldDisplay label="Application Rejected" value={config.applicationRejectionMessage || "(default)"} />
            <FieldDisplay label="Whitelist Revoked" value={config.whitelistRevokedMessage || "(default)"} />
            <FieldDisplay label="Pending (Staff Approval)" value={config.whitelistPendingApprovalMessage || "(default)"} />
            <FieldDisplay label="Pending (Scheduled)" value={config.whitelistPendingScheduledMessage || "(default)"} />
          </div>
        </CardContent>
      </Card>

      {/* Edit button */}
      <EditButton onClick={openEditWizard} />
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
      <div className="border-t border-zinc-700/30 pt-5">
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
        <div className="space-y-4 rounded-lg border border-zinc-700/30 bg-white/5 p-4">
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
        <div className="rounded-lg border border-zinc-700/30 bg-white/5 px-4 py-3 text-xs text-zinc-400">💡 With auto-whitelist off, all whitelist requests require manual staff approval.</div>
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

/** Small pill badges listing the placeholders available for a given message. */
function PlaceholderHints({ placeholders }: { placeholders: { token: string; hint: string }[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-1.5">
      {placeholders.map(({ token, hint }) => (
        <span
          key={token}
          title={hint}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-300 cursor-default select-all">
          {token}
          <span className="font-sans text-[10px] text-zinc-500 not-italic normal-case">— {hint}</span>
        </span>
      ))}
    </div>
  );
}

function StepMessages({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-700/30 bg-white/5 px-4 py-3 text-xs text-zinc-400">
        💡 These messages are shown to players when they connect to your Minecraft server. Use <code className="text-zinc-300">§</code> for Minecraft colour codes and{" "}
        <code className="text-zinc-300">\n</code> for new lines. Click any placeholder badge below to copy it.
      </div>

      <div>
        <PlaceholderHints placeholders={[{ token: "{player}", hint: "Minecraft username" }]} />
        <Textarea
          label="Welcome Back (Whitelisted)"
          description="Shown to a whitelisted player when they connect."
          value={draft.authSuccessMessage}
          onChange={(v) => update("authSuccessMessage", v)}
          placeholder="§aWelcome back, {player}!"
          rows={2}
          maxLength={300}
        />
      </div>

      <div>
        <PlaceholderHints
          placeholders={[
            { token: "{player}", hint: "Minecraft username" },
            { token: "{code}", hint: "authentication code" },
          ]}
        />
        <Textarea
          label="Auth Code Shown"
          description="Shown when a player connects to receive their authentication code."
          value={draft.authPendingMessage}
          onChange={(v) => update("authPendingMessage", v)}
          placeholder="§eYour authentication code is: §6{code}"
          rows={3}
          maxLength={300}
        />
      </div>

      <div>
        <PlaceholderHints
          placeholders={[
            { token: "{player}", hint: "Minecraft username" },
            { token: "{username}", hint: "Minecraft username (use in /link-minecraft command)" },
          ]}
        />
        <Textarea
          label="Not Linked / Rejected"
          description="Shown when an unknown player connects who hasn't started the linking process."
          value={draft.authRejectionMessage}
          onChange={(v) => update("authRejectionMessage", v)}
          placeholder="§cTo join this server, link your account…"
          rows={3}
          maxLength={300}
        />
      </div>

      <div>
        <PlaceholderHints placeholders={[{ token: "{player}", hint: "Minecraft username" }]} />
        <Textarea
          label="Application Rejected"
          description="Shown when a player whose application was rejected tries to connect."
          value={draft.applicationRejectionMessage}
          onChange={(v) => update("applicationRejectionMessage", v)}
          placeholder="§cYour whitelist application has been rejected."
          rows={3}
          maxLength={300}
        />
      </div>

      <div>
        <PlaceholderHints
          placeholders={[
            { token: "{player}", hint: "Minecraft username" },
            { token: "{reason}", hint: "revocation reason (empty if none)" },
          ]}
        />
        <Textarea
          label="Whitelist Revoked"
          description="Shown when a player's whitelist has been revoked."
          value={draft.whitelistRevokedMessage}
          onChange={(v) => update("whitelistRevokedMessage", v)}
          placeholder="§cYour whitelist has been revoked{reason}."
          rows={3}
          maxLength={300}
        />
      </div>

      <div>
        <PlaceholderHints placeholders={[{ token: "{player}", hint: "Minecraft username" }]} />
        <Textarea
          label="Pending (Staff Approval)"
          description="Shown when a player is linked but waiting for staff to approve their whitelist."
          value={draft.whitelistPendingApprovalMessage}
          onChange={(v) => update("whitelistPendingApprovalMessage", v)}
          placeholder="§eYour whitelist application is pending staff approval."
          rows={3}
          maxLength={300}
        />
      </div>

      <div>
        <PlaceholderHints
          placeholders={[
            { token: "{player}", hint: "Minecraft username" },
            { token: "{schedule}", hint: 'auto-filled with timing (e.g. "in 30 minutes")' },
          ]}
        />
        <Textarea
          label="Pending (Scheduled)"
          description="Shown when auto-whitelist is on a delay or schedule."
          value={draft.whitelistPendingScheduledMessage}
          onChange={(v) => update("whitelistPendingScheduledMessage", v)}
          placeholder="§eYou will be whitelisted {schedule}."
          rows={3}
          maxLength={300}
        />
      </div>
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
    fetchApi<{ roles: { id: string; name: string; color: string }[] }>(guildId, "roles", { cacheKey: `roles-${guildId}`, cacheTtl: 60_000 })
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
        <div className="space-y-4 rounded-lg border border-zinc-700/30 bg-white/5 p-4">
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
        <div className="space-y-4 rounded-lg border border-zinc-700/30 bg-white/5 p-4">
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
              ⚠️ RCON must be enabled and configured to use immediate role sync. Enable RCON below and fill in the connection details to continue.
            </div>
          )}

          {draft.roleSyncMode === "rcon" && draft.rconEnabled && (!draft.rconPassword || draft.rconPassword === "") && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              ⚠️ RCON password is required. Fill in the RCON connection details below to continue.
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
              {draft.roleMappings.map((mapping, i) => {
                const missingRole = !mapping.discordRoleId;
                const missingGroup = !mapping.minecraftGroup.trim();
                return (
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
                      error={missingRole && !missingGroup}
                    />

                    {/* Minecraft Group Text Input */}
                    <input
                      type="text"
                      value={mapping.minecraftGroup}
                      onChange={(e) => updateMapping(i, "minecraftGroup", e.target.value)}
                      placeholder="e.g. vip, admin, member"
                      className={`w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:ring-1 ${
                        missingGroup && !missingRole ? "border-red-500 focus:border-red-500 focus:ring-red-500/30" : "border-zinc-700 focus:border-primary-500 focus:ring-primary-500"
                      }`}
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
                );
              })}

              {/* Add Button */}
              <button
                onClick={addMapping}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700/30 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-primary-500 hover:text-primary-400">
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
        <div className="space-y-4 rounded-lg border border-zinc-700/30 bg-white/5 p-4">
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

      {/* Default Dashboard Tab */}
      <div>
        <p className="mb-3 text-sm font-medium text-zinc-300">Dashboard</p>
        <div className="space-y-4 rounded-lg border border-zinc-700/30 bg-white/5 p-4">
          <div>
            <p className="text-sm font-medium text-zinc-200">Default Tab</p>
            <p className="text-xs text-zinc-500 mb-3">Choose which tab opens by default on the Minecraft dashboard page</p>
            <div className="space-y-2">
              {[
                { value: "players" as const, label: "Players", desc: "Show the full players list" },
                { value: "pending" as const, label: "Pending", desc: "Show players filtered to pending whitelist requests" },
                { value: "config" as const, label: "Configuration", desc: "Show the configuration panel" },
                { value: "status" as const, label: "Server Status", desc: "Show the server status monitors" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    draft.defaultDashboardTab === opt.value ? "border-primary-500 bg-primary-600/10" : "border-zinc-700 hover:border-zinc-600"
                  }`}>
                  <input
                    type="radio"
                    name="defaultDashboardTab"
                    checked={draft.defaultDashboardTab === opt.value}
                    onChange={() => update("defaultDashboardTab", opt.value)}
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
        </div>
      </div>
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

        <ReviewSection title="Messages">
          <ReviewRow label="Welcome Back" value={draft.authSuccessMessage || "(default)"} />
          <ReviewRow label="Auth Code" value={draft.authPendingMessage || "(default)"} />
          <ReviewRow label="Not Linked" value={draft.authRejectionMessage || "(default)"} />
          <ReviewRow label="App Rejected" value={draft.applicationRejectionMessage || "(default)"} />
          <ReviewRow label="Whitelist Revoked" value={draft.whitelistRevokedMessage || "(default)"} />
          <ReviewRow label="Pending (Staff)" value={draft.whitelistPendingApprovalMessage || "(default)"} />
          <ReviewRow label="Pending (Scheduled)" value={draft.whitelistPendingScheduledMessage || "(default)"} />
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
            <div className="mt-2 space-y-1 rounded border border-zinc-700/30 bg-white/5 p-2">
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
          <ReviewRow
            label="Default Tab"
            value={
              draft.defaultDashboardTab === "pending" ? "Pending" : draft.defaultDashboardTab === "config" ? "Configuration" : draft.defaultDashboardTab === "status" ? "Server Status" : "Players"
            }
          />
        </ReviewSection>
      </div>
    </div>
  );
}

// ReviewSection, ReviewRow, FieldDisplay imported from @/components/ui/SetupWizard
