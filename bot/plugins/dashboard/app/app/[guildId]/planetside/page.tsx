/**
 * PlanetSide 2 management page — tabbed view with Players, Config, and API Status.
 * Client component because it uses Tabs (interactive).
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useGuild } from "@/components/providers/GuildProvider";
import PermissionGate from "@/components/guards/PermissionGate";
import Tabs from "@/components/ui/Tabs";
import Spinner from "@/components/ui/Spinner";
import PlayersTab from "./PlayersTab";
import ConfigTab from "./ConfigTab";
import StatusTab from "./StatusTab";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";

type DashboardTab = "players" | "pending" | "config" | "status";

export default function PlanetSidePage() {
  const { guild } = useGuild();
  const [defaultTab, setDefaultTab] = useState<DashboardTab | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDefaultTab = useCallback(async () => {
    try {
      const res = await fetchApi<{ defaultDashboardTab?: DashboardTab }>(guild.id, "planetside/config");
      if (res.success && res.data?.defaultDashboardTab) {
        setDefaultTab(res.data.defaultDashboardTab);
      } else {
        setDefaultTab("players");
      }
    } catch {
      setDefaultTab("players");
    } finally {
      setLoading(false);
    }
  }, [guild.id]);

  useEffect(() => {
    fetchDefaultTab();
  }, [fetchDefaultTab]);

  useRealtimeEvent("planetside:updated", () => {
    fetchDefaultTab();
  });

  const resolvedTab = defaultTab === "pending" ? "players" : (defaultTab ?? "players");
  const defaultPlayerFilter = defaultTab === "pending" ? "pending" : undefined;

  const tabs = [
    {
      id: "players",
      label: "Players",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
      content: <PlayersTab guildId={guild.id} defaultFilter={defaultPlayerFilter} />,
    },
    {
      id: "config",
      label: "Configuration",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      content: <ConfigTab guildId={guild.id} />,
    },
    {
      id: "status",
      label: "API Status",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
      content: <StatusTab guildId={guild.id} />,
    },
  ];

  if (loading && defaultTab === null) {
    return (
      <PermissionGate category="planetside">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">PlanetSide 2</h1>
            <p className="text-zinc-400">Manage linked players, outfit configuration, and API status.</p>
          </div>
          <div className="flex justify-center py-16">
            <Spinner label="Loading…" />
          </div>
        </div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate category="planetside">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PlanetSide 2</h1>
          <p className="text-zinc-400">Manage linked players, outfit configuration, and API status.</p>
        </div>

        <Tabs tabs={tabs} defaultTab={resolvedTab} />
      </div>
    </PermissionGate>
  );
}
