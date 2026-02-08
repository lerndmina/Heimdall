/**
 * Guild overview page — live stat cards fetched from all plugin APIs.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import { fetchApi } from "@/lib/api";

// ── Types ────────────────────────────────────────────────

interface GuildStatus {
  botInGuild: boolean;
  guildName?: string;
  memberCount?: number;
}

interface TicketStats {
  total: number;
  open: number;
  claimed: number;
  closed: number;
  archived: number;
}

interface ModmailStats {
  total: number;
  open: number;
  resolved: number;
  closed: number;
  recent?: { last24Hours?: number; last7Days?: number; last30Days?: number };
}

interface SuggestionStats {
  total: number;
  pending: number;
  approved: number;
  denied: number;
}

interface TempVCStats {
  active: number;
  totalCreated: number;
  averageLifetimeMinutes: number;
}

interface McServer {
  name: string;
  host: string;
  port: number;
  lastPing?: { online: boolean; players?: { online: number; max: number } };
}

// ── Stat Card ────────────────────────────────────────────

function StatCard({ title, value, description, icon, accent }: { title: string; value: string | number; description: string; icon: React.ReactNode; accent?: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-400">{title}</p>
          <p className={`mt-1 text-3xl font-bold ${accent ?? "text-zinc-100"}`}>{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
        </div>
        <div className="rounded-lg bg-white/5 p-2 text-zinc-400 backdrop-blur-sm">{icon}</div>
      </div>
    </Card>
  );
}

// ── Icons (inlined SVG) ─────────────────────────────────

const icons = {
  members: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  ),
  ticket: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  ),
  mail: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  suggestion: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  ),
  voice: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-2.464a5 5 0 010-7.072M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  tag: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  ),
  mc: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  reminder: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// ── Main Component ───────────────────────────────────────

export default function GuildOverviewPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [loading, setLoading] = useState(true);

  // Data
  const [guild, setGuild] = useState<GuildStatus | null>(null);
  const [tickets, setTickets] = useState<TicketStats | null>(null);
  const [modmail, setModmail] = useState<ModmailStats | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionStats | null>(null);
  const [tempvc, setTempvc] = useState<TempVCStats | null>(null);
  const [mcServers, setMcServers] = useState<McServer[]>([]);
  const [tagCount, setTagCount] = useState<number | null>(null);
  const [reminderCount, setReminderCount] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const safe = async <T,>(path: string): Promise<T | null> => {
      try {
        const res = await fetchApi<T>(guildId, path, { skipCache: true });
        return res.success && res.data != null ? res.data : null;
      } catch {
        return null;
      }
    };

    const [g, t, m, s, v, mc, tags] = await Promise.all([
      safe<GuildStatus>("status"),
      safe<TicketStats>("tickets/stats"),
      safe<ModmailStats>("modmail/stats"),
      safe<SuggestionStats>("suggestions/stats"),
      safe<TempVCStats>("tempvc/stats"),
      safe<{ servers: McServer[]; total?: number }>("minecraft/status"),
      safe<any[]>("tags"),
    ]);

    setGuild(g);
    setTickets(t);
    setModmail(m);
    setSuggestions(s);
    setTempvc(v);
    setMcServers(mc?.servers ?? []);
    setTagCount(tags ? tags.length : null);
    setLoading(false);
  }, [guildId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading overview…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{guild?.guildName ?? "Overview"}</h1>
        <p className="text-zinc-400">Server dashboard at a glance.</p>
      </div>

      {/* ── Primary stats ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Members" value={guild?.memberCount?.toLocaleString() ?? "—"} description="Total server members" icon={icons.members} />

        {tickets && (
          <StatCard title="Open Tickets" value={tickets.open} description={`${tickets.total.toLocaleString()} total · ${tickets.claimed} claimed`} icon={icons.ticket} accent="text-blue-400" />
        )}

        {modmail && (
          <StatCard
            title="Open Modmail"
            value={modmail.open}
            description={`${modmail.total.toLocaleString()} total · ${modmail.recent?.last24Hours ?? 0} last 24h`}
            icon={icons.mail}
            accent="text-purple-400"
          />
        )}

        {suggestions && (
          <StatCard
            title="Pending Suggestions"
            value={suggestions.pending}
            description={`${suggestions.total.toLocaleString()} total · ${suggestions.approved} approved`}
            icon={icons.suggestion}
            accent="text-yellow-400"
          />
        )}
      </div>

      {/* ── Secondary stats ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tempvc && <StatCard title="Active Voice" value={tempvc.active} description={`${tempvc.totalCreated.toLocaleString()} total created`} icon={icons.voice} />}

        {tagCount !== null && <StatCard title="Tags" value={tagCount} description="Custom response tags" icon={icons.tag} />}

        {mcServers.length > 0 && (
          <StatCard
            title="MC Servers"
            value={mcServers.filter((s) => s.lastPing?.online).length + "/" + mcServers.length}
            description={`${mcServers.reduce((a, s) => a + (s.lastPing?.players?.online ?? 0), 0)} players online`}
            icon={icons.mc}
            accent="text-green-400"
          />
        )}
      </div>

      {/* ── Minecraft servers detail ── */}
      {mcServers.length > 0 && (
        <Card>
          <CardTitle>Minecraft Servers</CardTitle>
          <CardContent>
            <div className="mt-3 divide-y divide-zinc-700/30">
              {mcServers.map((srv, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{srv.name}</p>
                    <p className="text-xs text-zinc-500">
                      {srv.host}:{srv.port}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {srv.lastPing?.players && (
                      <span className="text-sm text-zinc-400">
                        {srv.lastPing.players.online}/{srv.lastPing.players.max}
                      </span>
                    )}
                    <StatusBadge variant={srv.lastPing?.online ? "success" : "error"}>{srv.lastPing?.online ? "Online" : "Offline"}</StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Ticket & Modmail breakdown ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {tickets && (
          <Card>
            <CardTitle>Ticket Breakdown</CardTitle>
            <CardContent>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(
                  [
                    ["Open", tickets.open, "text-blue-400"],
                    ["Claimed", tickets.claimed, "text-yellow-400"],
                    ["Closed", tickets.closed, "text-zinc-400"],
                    ["Archived", tickets.archived, "text-zinc-500"],
                  ] as const
                ).map(([label, val, color]) => (
                  <div key={label} className="rounded-lg border border-zinc-700/20 bg-white/5 p-3 backdrop-blur-sm transition-transform duration-200 hover:scale-[1.02]">
                    <p className="text-xs text-zinc-500">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{val.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {suggestions && (
          <Card>
            <CardTitle>Suggestions Breakdown</CardTitle>
            <CardContent>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {(
                  [
                    ["Pending", suggestions.pending, "text-yellow-400"],
                    ["Approved", suggestions.approved, "text-green-400"],
                    ["Denied", suggestions.denied, "text-red-400"],
                  ] as const
                ).map(([label, val, color]) => (
                  <div key={label} className="rounded-lg border border-zinc-700/20 bg-white/5 p-3 backdrop-blur-sm transition-transform duration-200 hover:scale-[1.02]">
                    <p className="text-xs text-zinc-500">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{val.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
