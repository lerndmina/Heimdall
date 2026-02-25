/**
 * Status tab — Census/Honu API health + world population overview.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────

interface ApiHealth {
  online: boolean | null;
  lastChecked: string | null;
  lastChange: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

interface CensusStatusData {
  guildId: string;
  census: ApiHealth;
  honu: ApiHealth;
  fisu: ApiHealth;
  statusMessageId?: string;
  statusChannelId?: string;
}

interface TestResults {
  honu?: { online: boolean; responseTime?: string; error?: string };
  census?: { online: boolean; error?: string };
  fisu?: { online: boolean; error?: string };
}

interface WorldPopulation {
  worldId: number;
  worldName?: string;
  vs: number;
  nc: number;
  tr: number;
  ns: number;
  total: number;
}

const SERVER_NAMES: Record<number, string> = {
  1: "Osprey",
  10: "Wainwright",
  19: "Jaeger",
  40: "SolTech",
};

const FACTION_COLORS: Record<string, string> = {
  vs: "bg-purple-500",
  nc: "bg-blue-500",
  tr: "bg-red-500",
  ns: "bg-zinc-400",
};

// ── Component ──────────────────────────────────────────────────

export default function StatusTab({ guildId }: { guildId: string }) {
  const [healthStatus, setHealthStatus] = useState<CensusStatusData | null>(null);
  const [population, setPopulation] = useState<WorldPopulation[] | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingPop, setLoadingPop] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);

  // ── Fetch health status ───────────────────────────────────

  const fetchHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const res = await fetchApi<CensusStatusData>(guildId, "planetside/census-status");
      if (res.success && res.data) {
        setHealthStatus(res.data);
      }
    } catch {
      // Silent fail — we'll show unknown state
    } finally {
      setLoadingHealth(false);
    }
  }, [guildId]);

  const fetchPopulation = useCallback(async () => {
    setLoadingPop(true);
    try {
      const res = await fetchApi<WorldPopulation[]>(guildId, "planetside/population");
      if (res.success && res.data) {
        setPopulation(res.data);
      }
    } catch {
      // Population might not be available
    } finally {
      setLoadingPop(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchHealth();
    fetchPopulation();
  }, [fetchHealth, fetchPopulation]);

  useRealtimeEvent("planetside:updated", () => {
    fetchHealth();
    fetchPopulation();
  });

  // ── Test connectivity ─────────────────────────────────────

  const handleTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetchApi<TestResults>(guildId, "planetside/census-status/test", {
        method: "POST",
      });
      if (res.success && res.data) {
        setTestResults(res.data);
        toast.success("Connectivity test complete");
      } else {
        toast.error(res.error?.message ?? "Test failed");
      }
    } catch {
      toast.error("Failed to run connectivity test");
    } finally {
      setTesting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* API Health */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>API Health</CardTitle>
            <CardDescription>Real-time status of PlanetSide 2 APIs.</CardDescription>
          </div>
          <button onClick={handleTest} disabled={testing} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
            {testing ? "Testing…" : "Test Connectivity"}
          </button>
        </div>
        <CardContent>
          {loadingHealth ? (
            <div className="flex justify-center py-8">
              <Spinner label="Loading status…" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ApiHealthCard name="Honu API" description="Real-time data, character lookup, population" health={healthStatus?.honu ?? null} testResult={testResults?.honu} />
              <ApiHealthCard name="Census API" description="Daybreak official — character stats, verification" health={healthStatus?.census ?? null} testResult={testResults?.census} />
              <ApiHealthCard name="Fisu API" description="Fallback — population data" health={healthStatus?.fisu ?? null} testResult={testResults?.fisu} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Population */}
      <Card>
        <CardTitle>Server Population</CardTitle>
        <CardDescription>Current player counts across all PlanetSide 2 servers.</CardDescription>
        <CardContent>
          {loadingPop ? (
            <div className="flex justify-center py-8">
              <Spinner label="Loading population…" />
            </div>
          ) : !population || population.length === 0 ? (
            <p className="text-sm text-zinc-400">Population data is not available. The Honu or Fisu APIs may be unreachable.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {population.map((world) => (
                <WorldCard key={world.worldId} world={world} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function ApiHealthCard({
  name,
  description,
  health,
  testResult,
}: {
  name: string;
  description: string;
  health: ApiHealth | null;
  testResult?: { online: boolean; responseTime?: string; error?: string };
}) {
  const isOnline = testResult ? testResult.online : health?.online;
  const variant: "success" | "error" | "neutral" = isOnline === true ? "success" : isOnline === false ? "error" : "neutral";

  return (
    <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-100">{name}</h4>
        <StatusBadge variant={variant}>{isOnline === true ? "Online" : isOnline === false ? "Offline" : "Unknown"}</StatusBadge>
      </div>
      <p className="text-xs text-zinc-500">{description}</p>

      {health && (
        <div className="space-y-1 text-xs text-zinc-400">
          {health.lastChecked && <p>Last checked: {timeSince(new Date(health.lastChecked))}</p>}
          {health.consecutiveFailures > 0 && (
            <p className="text-red-400">
              {health.consecutiveFailures} consecutive failure{health.consecutiveFailures > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {testResult?.error && <p className="text-xs text-red-400">{testResult.error}</p>}
      {testResult?.responseTime && <p className="text-xs text-zinc-400">Response: {testResult.responseTime}</p>}
    </div>
  );
}

function WorldCard({ world }: { world: WorldPopulation }) {
  const name = world.worldName || SERVER_NAMES[world.worldId] || `World ${world.worldId}`;
  const total = world.total || world.vs + world.nc + world.tr + (world.ns || 0);
  const maxFaction = Math.max(world.vs, world.nc, world.tr, 1);

  return (
    <div className="rounded-lg border border-zinc-700/30 bg-white/5 backdrop-blur-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-100">{name}</h4>
        <span className="text-xs font-medium text-zinc-400">{total} online</span>
      </div>

      <div className="space-y-2">
        <FactionBar label="VS" count={world.vs} max={maxFaction} color={FACTION_COLORS.vs} />
        <FactionBar label="NC" count={world.nc} max={maxFaction} color={FACTION_COLORS.nc} />
        <FactionBar label="TR" count={world.tr} max={maxFaction} color={FACTION_COLORS.tr} />
        {world.ns > 0 && <FactionBar label="NSO" count={world.ns} max={maxFaction} color={FACTION_COLORS.ns} />}
      </div>
    </div>
  );
}

function FactionBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-xs font-medium text-zinc-400">{label}</span>
      <div className="flex-1 h-4 rounded-full bg-zinc-700/30 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs text-zinc-400">{count}</span>
    </div>
  );
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
