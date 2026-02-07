/**
 * Guild overview page — summary cards for the guild.
 * Scaffold placeholder for now.
 */
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

export default function GuildOverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-zinc-400">Server dashboard at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle>Members</CardTitle>
          <CardContent>
            <p className="mt-2 text-3xl font-bold text-zinc-100">—</p>
            <CardDescription>Total server members</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardTitle>Minecraft Players</CardTitle>
          <CardContent>
            <p className="mt-2 text-3xl font-bold text-zinc-100">—</p>
            <CardDescription>Linked players</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardTitle>Open Tickets</CardTitle>
          <CardContent>
            <p className="mt-2 text-3xl font-bold text-zinc-100">—</p>
            <CardDescription>Active support tickets</CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardTitle>Recent Activity</CardTitle>
        <CardContent>
          <p className="mt-2 text-sm text-zinc-500">Activity feed coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
