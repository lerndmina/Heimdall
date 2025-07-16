"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequireGuild } from "./use-require-guild";
import { apiClient } from "@/lib/api";

export function DashboardHome() {
  const { selectedGuild } = useRequireGuild();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["modmail-stats", selectedGuild?.guildId],
    queryFn: () => (selectedGuild ? apiClient.getModmailStats(selectedGuild.guildId) : null),
    enabled: !!selectedGuild,
  });

  const { data: threads, isLoading: threadsLoading } = useQuery({
    queryKey: ["modmail-threads", selectedGuild?.guildId, "recent"],
    queryFn: () =>
      selectedGuild
        ? apiClient.getModmailThreads(selectedGuild.guildId, {
            limit: 5,
            sortBy: "lastActivity",
            sortOrder: "desc",
          })
        : null,
    enabled: !!selectedGuild,
  });

  if (!selectedGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-discord-warning mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Guild Selected</h3>
          <p className="text-discord-muted">Please select a guild from the navigation to view the dashboard.</p>
        </div>
      </div>
    );
  }

  const statsData = (stats as any)?.data || {};
  const threadsData = (threads as any)?.data?.threads || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-discord-text">Overview of modmail activity for {selectedGuild.guildName}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-discord-text flex items-center">
              <MessageSquare className="h-4 w-4 mr-2 text-discord-primary" />
              Total Threads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{statsLoading ? "..." : statsData.total || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-discord-text flex items-center">
              <Clock className="h-4 w-4 mr-2 text-discord-success" />
              Open Threads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{statsLoading ? "..." : statsData.open || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-discord-text flex items-center">
              <CheckCircle className="h-4 w-4 mr-2 text-discord-warning" />
              Closed Threads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{statsLoading ? "..." : statsData.closed || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-discord-text flex items-center">
              <MessageSquare className="h-4 w-4 mr-2 text-discord-primary" />
              Total Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{statsLoading ? "..." : statsData.totalMessages || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-discord-dark border-discord-darker">
        <CardHeader>
          <CardTitle className="text-white">Recent Activity</CardTitle>
          <CardDescription className="text-discord-muted">Latest modmail threads and updates</CardDescription>
        </CardHeader>
        <CardContent>
          {threadsLoading ? (
            <div className="text-center py-8">
              <div className="text-discord-muted">Loading recent activity...</div>
            </div>
          ) : threadsData.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-discord-muted mx-auto mb-4" />
              <div className="text-discord-muted">No recent modmail threads</div>
            </div>
          ) : (
            <div className="space-y-4">
              {threadsData.map((thread: any) => (
                <div key={thread.forumThreadId} className="flex items-center justify-between p-4 bg-discord-darker rounded-lg border border-discord-dark">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${thread.isClosed ? "bg-discord-danger" : thread.markedResolved ? "bg-discord-warning" : "bg-discord-success"}`} />
                    <div>
                      <div className="font-medium text-white">{thread.userDisplayName || "Unknown User"}</div>
                      <div className="text-sm text-discord-muted">{thread.messageCount} messages</div>
                    </div>
                  </div>
                  <div className="text-sm text-discord-muted">{new Date(thread.lastUserActivityAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
