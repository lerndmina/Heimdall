/**
 * Status tab — Minecraft server status cards scaffold.
 * In the future this will show live server status via the monitoring data.
 */
"use client";

import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";

export default function StatusTab({ guildId: _guildId }: { guildId: string }) {
  // TODO: Fetch server status from the API (ServerMonitor model not currently exposed via API)
  // For now, show a scaffold placeholder.

  return (
    <div className="space-y-6">
      {/* Placeholder server card */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Minecraft Server</CardTitle>
            <CardDescription>Server monitoring is available when the Minecraft plugin is configured.</CardDescription>
          </div>
          <StatusBadge variant="neutral">Pending</StatusBadge>
        </div>
        <CardContent>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Players Online" value="—" />
            <StatCard label="TPS" value="—" />
            <StatCard label="Uptime" value="—" />
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">
        <p>💡 Server status monitoring will display real-time information once the Minecraft plugin server monitor is configured and an API endpoint is exposed.</p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}
