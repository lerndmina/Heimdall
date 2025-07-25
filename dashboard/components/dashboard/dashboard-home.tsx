"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { MessageSquare, Clock, CheckCircle, AlertCircle, User, Shield, FileText, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRequireGuild } from "./use-require-guild";
import { apiClient } from "@/lib/api";

export function DashboardHome() {
  const { selectedGuild } = useRequireGuild();

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["modmail-stats", selectedGuild?.guildId],
    queryFn: async () => {
      if (!selectedGuild) return null;
      console.log("Fetching stats for guild:", selectedGuild.guildId);
      const result = await apiClient.getModmailStats(selectedGuild.guildId, "all");
      console.log("Stats result:", result);
      return result;
    },
    enabled: !!selectedGuild,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  const {
    data: threads,
    isLoading: threadsLoading,
    error: threadsError,
  } = useQuery({
    queryKey: ["modmail-threads", selectedGuild?.guildId, "recent"],
    queryFn: async () => {
      if (!selectedGuild) return null;
      console.log("Fetching recent threads for guild:", selectedGuild.guildId);
      const result = await apiClient.getModmailThreads(selectedGuild.guildId, {
        limit: 5,
        sortBy: "lastActivity",
        sortOrder: "desc",
      });
      console.log("Threads result:", result);
      return result;
    },
    enabled: !!selectedGuild,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
    refetchInterval: 2 * 60 * 1000, // Auto-refresh every 2 minutes
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

  // Handle different response structures
  let statsData: any = {};
  if (stats) {
    if ((stats as any)?.data) {
      statsData = (stats as any).data;
    } else if ((stats as any)?.success && (stats as any)?.data) {
      statsData = (stats as any).data;
    } else {
      statsData = stats as any;
    }
  }

  let threadsData: any[] = [];
  if (threads) {
    if ((threads as any)?.data?.threads) {
      threadsData = (threads as any).data.threads;
    } else if ((threads as any)?.data && Array.isArray((threads as any).data)) {
      threadsData = (threads as any).data;
    } else if (Array.isArray(threads)) {
      threadsData = threads;
    }
  }

  console.log("Processed statsData:", statsData);
  console.log("Processed threadsData:", threadsData);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-discord-text">Overview of modmail activity for {selectedGuild.guildName}</p>

        {/* Error display */}
        {(statsError || threadsError) && (
          <div className="mt-4 p-4 bg-discord-danger/10 border border-discord-danger rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-discord-danger mr-2" />
              <span className="text-discord-danger text-sm">
                {statsError && `Failed to load stats: ${statsError.message}`}
                {statsError && threadsError && " | "}
                {threadsError && `Failed to load threads: ${threadsError.message}`}
              </span>
            </div>
          </div>
        )}
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
