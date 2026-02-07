/**
 * Config tab — settings form scaffold for Minecraft plugin configuration.
 */
"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { fetchApi } from "@/lib/api";

interface MinecraftConfig {
  guildId: string;
  enabled: boolean;
  autoWhitelist: boolean;
  serverName: string;
  serverIp: string;
  serverPort: number;
  rconEnabled: boolean;
  rconHost?: string;
  rconPort: number;
  cacheTimeout: number;
  maxPlayersPerUser: number;
  requireApproval: boolean;
  requireDiscordLink: boolean;
  enableRoleSync: boolean;
  enableMinecraftPlugin: boolean;
  enableAutoRevoke: boolean;
  enableAutoRestore: boolean;
}

export default function ConfigTab({ guildId }: { guildId: string }) {
  const [config, setConfig] = useState<MinecraftConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchApi<MinecraftConfig>(guildId, "minecraft/config")
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setConfig(res.data);
        } else {
          setError(res.error?.message ?? "Failed to load configuration");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to connect to API");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [guildId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500">
        <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading configuration...
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

  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* Server Info */}
      <Card>
        <CardTitle>Server Connection</CardTitle>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Server Name" value={config.serverName} />
            <FieldDisplay label="Server IP" value={`${config.serverIp}:${config.serverPort}`} />
            <FieldDisplay label="Plugin Enabled">
              <StatusBadge variant={config.enabled ? "success" : "neutral"}>{config.enabled ? "Enabled" : "Disabled"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Minecraft Plugin">
              <StatusBadge variant={config.enableMinecraftPlugin ? "success" : "neutral"}>{config.enableMinecraftPlugin ? "Connected" : "Not connected"}</StatusBadge>
            </FieldDisplay>
          </div>
        </CardContent>
      </Card>

      {/* Whitelist Settings */}
      <Card>
        <CardTitle>Whitelist Settings</CardTitle>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Auto Whitelist">
              <StatusBadge variant={config.autoWhitelist ? "success" : "neutral"}>{config.autoWhitelist ? "On" : "Off"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Require Approval">
              <StatusBadge variant={config.requireApproval ? "warning" : "neutral"}>{config.requireApproval ? "Required" : "Not required"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Require Discord Link">
              <StatusBadge variant={config.requireDiscordLink ? "info" : "neutral"}>{config.requireDiscordLink ? "Required" : "Not required"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Max Players Per User" value={String(config.maxPlayersPerUser)} />
          </div>
        </CardContent>
      </Card>

      {/* Sync & RCON */}
      <Card>
        <CardTitle>Sync &amp; RCON</CardTitle>
        <CardContent>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldDisplay label="Role Sync">
              <StatusBadge variant={config.enableRoleSync ? "success" : "neutral"}>{config.enableRoleSync ? "Enabled" : "Disabled"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Auto Revoke on Leave">
              <StatusBadge variant={config.enableAutoRevoke ? "warning" : "neutral"}>{config.enableAutoRevoke ? "Enabled" : "Disabled"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="Auto Restore on Rejoin">
              <StatusBadge variant={config.enableAutoRestore ? "success" : "neutral"}>{config.enableAutoRestore ? "Enabled" : "Disabled"}</StatusBadge>
            </FieldDisplay>
            <FieldDisplay label="RCON">
              <StatusBadge variant={config.rconEnabled ? "success" : "neutral"}>{config.rconEnabled ? `Enabled (${config.rconHost ?? config.serverIp}:${config.rconPort})` : "Disabled"}</StatusBadge>
            </FieldDisplay>
          </div>
        </CardContent>
      </Card>

      {/* Edit button placeholder */}
      <div className="flex justify-end">
        <button disabled className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white opacity-50 cursor-not-allowed" title="Editing coming soon">
          Edit Configuration
        </button>
      </div>
    </div>
  );
}

/** Read-only field display */
function FieldDisplay({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-1">{children ?? <p className="text-sm text-zinc-200">{value ?? "—"}</p>}</div>
    </div>
  );
}
