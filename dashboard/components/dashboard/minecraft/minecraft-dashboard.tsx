"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { User, Users, Clock, CheckCircle, AlertCircle, Settings, Server, Shield, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useRequireGuild } from "../use-require-guild";

interface MinecraftStats {
  totalPlayers: number;
  linkedPlayers: number;
  whitelistedPlayers: number;
  pendingApprovals: number;
}

interface PendingAuth {
  _id: string;
  discordId: string;
  minecraftUsername: string;
  authCode: string;
  createdAt: string;
  confirmedAt: string;
}

export function MinecraftDashboard() {
  const { selectedGuild } = useRequireGuild();
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch minecraft stats
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["minecraft-stats", selectedGuild?.guildId],
    queryFn: async () => {
      if (!selectedGuild) return null;

      // Get all players to calculate stats
      const playersResponse = await fetch(`/api/minecraft/${selectedGuild.guildId}/players`);
      const players = await playersResponse.json();

      if (!playersResponse.ok) {
        throw new Error(players.error || "Failed to fetch players");
      }

      const playerData = players.data || [];

      return {
        totalPlayers: playerData.length,
        linkedPlayers: playerData.filter((p: any) => p.discordId).length,
        whitelistedPlayers: playerData.filter((p: any) => p.whitelistStatus === "whitelisted").length,
        pendingApprovals: 0, // Will be fetched separately
      } as MinecraftStats;
    },
    enabled: !!selectedGuild,
    staleTime: 30 * 1000, // Cache for 30 seconds
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  // Fetch pending approvals
  const {
    data: pendingApprovals,
    isLoading: pendingLoading,
    error: pendingError,
  } = useQuery({
    queryKey: ["minecraft-pending", selectedGuild?.guildId],
    queryFn: async () => {
      if (!selectedGuild) return [];

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/pending`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch pending approvals");
      }

      return result.data || [];
    },
    enabled: !!selectedGuild,
    staleTime: 10 * 1000, // Cache for 10 seconds
    refetchInterval: 10 * 1000, // Auto-refresh every 10 seconds for real-time updates
  });

  // Approve pending auth mutation
  const approveMutation = useMutation({
    mutationFn: async ({ authId, notes }: { authId: string; notes?: string }) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/approve/${authId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          staffMemberId: session?.user?.id || "unknown",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to approve player");
      }

      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Player Approved",
        description: `${data.data.minecraftUsername} has been approved and whitelisted.`,
      });
      // Refresh both queries
      queryClient.invalidateQueries({ queryKey: ["minecraft-pending"] });
      queryClient.invalidateQueries({ queryKey: ["minecraft-stats"] });
    },
    onError: (error) => {
      toast({
        title: "Approval Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reject pending auth mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ authId, reason }: { authId: string; reason?: string }) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/reject/${authId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          staffMemberId: session?.user?.id || "unknown",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to reject player");
      }

      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Player Rejected",
        description: `${data.data.minecraftUsername} has been rejected.`,
      });
      queryClient.invalidateQueries({ queryKey: ["minecraft-pending"] });
    },
    onError: (error) => {
      toast({
        title: "Rejection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!selectedGuild) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium">No Guild Selected</h3>
          <p className="text-gray-600">Please select a guild to manage Minecraft integration.</p>
        </div>
      </div>
    );
  }

  const actualPendingCount = pendingApprovals?.length || 0;
  const updatedStats = stats ? { ...stats, pendingApprovals: actualPendingCount } : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minecraft Integration</h1>
          <p className="text-muted-foreground">Manage Minecraft account linking and whitelist approvals for {selectedGuild.guildName}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" asChild>
            <a href="/dashboard/minecraft/config">
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </a>
          </Button>
          <Button asChild>
            <a href="/dashboard/minecraft/players">
              <Users className="h-4 w-4 mr-2" />
              Manage Players
            </a>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsLoading ? "..." : updatedStats?.totalPlayers || 0}</div>
            <p className="text-xs text-muted-foreground">All registered players</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Linked Accounts</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsLoading ? "..." : updatedStats?.linkedPlayers || 0}</div>
            <p className="text-xs text-muted-foreground">Discord accounts linked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Whitelisted</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsLoading ? "..." : updatedStats?.whitelistedPlayers || 0}</div>
            <p className="text-xs text-muted-foreground">Can join the server</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingLoading ? "..." : actualPendingCount}</div>
            <p className="text-xs text-muted-foreground">Awaiting staff review</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals Section */}
      {actualPendingCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Approvals ({actualPendingCount})
            </CardTitle>
            <CardDescription>Review and approve Discord users who want to link their Minecraft accounts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingApprovals?.map((auth: PendingAuth) => (
              <div key={auth._id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <Avatar>
                    <AvatarImage src={`https://cdn.discordapp.com/avatars/${auth.discordId}/avatar.png`} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        <User className="inline h-4 w-4 mr-1" />
                        Discord ID: {auth.discordId}
                      </span>
                      <Badge variant="secondary">→</Badge>
                      <span className="font-medium">
                        <Server className="inline h-4 w-4 mr-1" />
                        {auth.minecraftUsername}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">Confirmed: {new Date(auth.confirmedAt).toLocaleString()}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      rejectMutation.mutate({
                        authId: auth._id,
                        reason: "Manual rejection by staff",
                      })
                    }
                    disabled={rejectMutation.isPending}>
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      approveMutation.mutate({
                        authId: auth._id,
                        notes: "Approved via dashboard",
                      })
                    }
                    disabled={approveMutation.isPending}>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common minecraft management tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button variant="outline" asChild>
            <a href="/dashboard/minecraft/players">
              <Users className="h-4 w-4 mr-2" />
              View All Players
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/dashboard/minecraft/config">
              <Settings className="h-4 w-4 mr-2" />
              Server Configuration
            </a>
          </Button>
          <Button variant="outline" disabled>
            <Plus className="h-4 w-4 mr-2" />
            Import Whitelist
            <Badge variant="secondary" className="ml-2">
              Soon
            </Badge>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
