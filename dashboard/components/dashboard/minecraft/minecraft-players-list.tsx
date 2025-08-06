"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { User, Users, Search, Filter, CheckCircle, XCircle, AlertCircle, Shield, Clock, MoreVertical, Ban, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRequireGuild } from "../use-require-guild";

interface MinecraftPlayer {
  _id: string;
  minecraftUsername: string;
  discordId?: string;
  whitelistStatus: "whitelisted" | "unwhitelisted" | "banned";
  linkedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  revokedAt?: string;
  revokedBy?: string;
  notes?: string;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
}

export function MinecraftPlayersList() {
  const { selectedGuild } = useRequireGuild();
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch all players
  const {
    data: players,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["minecraft-players", selectedGuild?.guildId],
    queryFn: async () => {
      if (!selectedGuild) return [];

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/players`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch players");
      }

      return result.data || [];
    },
    enabled: !!selectedGuild,
    staleTime: 30 * 1000, // Cache for 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every minute
  });

  // Whitelist/unwhitelist mutation
  const whitelistMutation = useMutation({
    mutationFn: async ({ playerId, action, notes }: { playerId: string; action: "whitelist" | "unwhitelist" | "ban"; notes?: string }) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/players/${playerId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          staffMemberId: session?.user?.id || "unknown",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Failed to ${action} player`);
      }

      return result;
    },
    onSuccess: (data, variables) => {
      const actionText = variables.action === "whitelist" ? "whitelisted" : variables.action === "ban" ? "banned" : "removed from whitelist";

      toast({
        title: "Player Updated",
        description: `${data.data.minecraftUsername} has been ${actionText}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["minecraft-players"] });
    },
    onError: (error) => {
      toast({
        title: "Action Failed",
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
          <p className="text-gray-600">Please select a guild to manage players.</p>
        </div>
      </div>
    );
  }

  // Filter players based on search and status
  const filteredPlayers = (players || []).filter((player: MinecraftPlayer) => {
    const matchesSearch = !searchQuery || player.minecraftUsername.toLowerCase().includes(searchQuery.toLowerCase()) || (player.discordId && player.discordId.includes(searchQuery));

    const matchesStatus = statusFilter === "all" || player.whitelistStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "whitelisted":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Whitelisted
          </Badge>
        );
      case "banned":
        return (
          <Badge variant="destructive">
            <Ban className="h-3 w-3 mr-1" />
            Banned
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Unwhitelisted
          </Badge>
        );
    }
  };

  const getPlayerActions = (player: MinecraftPlayer) => {
    const actions = [];

    if (player.whitelistStatus !== "whitelisted") {
      actions.push(
        <Button
          key="whitelist"
          size="sm"
          variant="outline"
          onClick={() =>
            whitelistMutation.mutate({
              playerId: player._id,
              action: "whitelist",
              notes: "Whitelisted via dashboard",
            })
          }
          disabled={whitelistMutation.isPending}>
          <UserPlus className="h-4 w-4 mr-2" />
          Whitelist
        </Button>
      );
    }

    if (player.whitelistStatus === "whitelisted") {
      actions.push(
        <Button
          key="unwhitelist"
          size="sm"
          variant="outline"
          onClick={() =>
            whitelistMutation.mutate({
              playerId: player._id,
              action: "unwhitelist",
              notes: "Removed from whitelist via dashboard",
            })
          }
          disabled={whitelistMutation.isPending}>
          <XCircle className="h-4 w-4 mr-2" />
          Remove
        </Button>
      );
    }

    if (player.whitelistStatus !== "banned") {
      actions.push(
        <Button
          key="ban"
          size="sm"
          variant="destructive"
          onClick={() =>
            whitelistMutation.mutate({
              playerId: player._id,
              action: "ban",
              notes: "Banned via dashboard",
            })
          }
          disabled={whitelistMutation.isPending}>
          <Ban className="h-4 w-4 mr-2" />
          Ban
        </Button>
      );
    }

    return actions;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minecraft Players</h1>
          <p className="text-muted-foreground">Manage player whitelist and linking status for {selectedGuild.guildName}</p>
        </div>
        <Button asChild>
          <a href="/dashboard/minecraft">← Back to Overview</a>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by Minecraft username or Discord ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Players</SelectItem>
              <SelectItem value="whitelisted">Whitelisted</SelectItem>
              <SelectItem value="unwhitelisted">Unwhitelisted</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Players List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Players ({filteredPlayers.length})
          </CardTitle>
          <CardDescription>{statusFilter === "all" ? "All registered players" : `Players with status: ${statusFilter}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium">{searchQuery || statusFilter !== "all" ? "No players match your filters" : "No players found"}</h3>
              <p className="text-gray-600">
                {searchQuery || statusFilter !== "all" ? "Try adjusting your search or filter criteria." : "Players will appear here once they start linking their accounts."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPlayers.map((player: MinecraftPlayer) => (
                <div key={player._id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    {/* Player Avatar */}
                    <div className="flex items-center space-x-3">
                      {/* Minecraft skin avatar */}
                      <Avatar>
                        <AvatarImage src={`https://crafatar.com/avatars/${player.minecraftUsername}?size=40&overlay`} alt={player.minecraftUsername} />
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>

                      {/* Discord avatar if linked */}
                      {player.discordId && (
                        <Avatar className="border-2 border-blue-200">
                          <AvatarImage src={`https://cdn.discordapp.com/avatars/${player.discordId}/avatar.png`} alt="Discord Avatar" />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>

                    {/* Player Info */}
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{player.minecraftUsername}</span>
                        {getStatusBadge(player.whitelistStatus)}
                        {player.discordId && (
                          <Badge variant="outline" className="text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            Linked
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-x-2">
                        {player.discordId && <span>Discord: {player.discordId}</span>}
                        {player.linkedAt && <span>• Linked: {new Date(player.linkedAt).toLocaleDateString()}</span>}
                        {player.approvedAt && <span>• Approved: {new Date(player.approvedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">{getPlayerActions(player)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
