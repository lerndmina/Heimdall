"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { User, Users, Search, Filter, CheckCircle, XCircle, AlertCircle, Shield, Clock, MoreVertical, UserPlus, Upload, FileText, Link, Edit } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRequireGuild } from "../use-require-guild";

interface MinecraftPlayer {
  _id: string;
  minecraftUsername: string;
  minecraftUuid?: string;
  discordId?: string;
  discordUsername?: string;
  discordDisplayName?: string;
  whitelistStatus: "whitelisted" | "unwhitelisted";
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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [linkDiscordId, setLinkDiscordId] = useState("");

  // Edit player dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<MinecraftPlayer | null>(null);
  const [editPlayerData, setEditPlayerData] = useState({
    minecraftUsername: "",
    minecraftUuid: "",
    discordId: "",
    notes: "",
  });

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
    mutationFn: async ({ playerId, action, notes }: { playerId: string; action: "whitelist" | "unwhitelist"; notes?: string }) => {
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
      const actionText = variables.action === "whitelist" ? "whitelisted" : "removed from whitelist";

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

  // Whitelist import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedGuild) throw new Error("No guild selected");

      // Read and parse the JSON file
      const text = await file.text();
      let whitelistData;

      try {
        whitelistData = JSON.parse(text);
      } catch (parseError) {
        throw new Error("Invalid JSON file format");
      }

      // Validate the whitelist format
      if (!Array.isArray(whitelistData)) {
        throw new Error("Invalid whitelist format. Expected array of player objects.");
      }

      for (const player of whitelistData) {
        if (!player.name || !player.uuid) {
          throw new Error(`Invalid player entry: missing name or uuid`);
        }
      }

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/import-whitelist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(whitelistData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to import whitelist");
      }

      return result;
    },
    onSuccess: (data) => {
      const summary = data.data;
      toast({
        title: "Import Complete",
        description: `Imported: ${summary.imported}, Updated: ${summary.updated}${summary.errors > 0 ? `, Errors: ${summary.errors}` : ""}`,
        variant: summary.errors > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["minecraft-players"] });
      setShowImportDialog(false);
      setImportFile(null);
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Manual link mutation
  const linkMutation = useMutation({
    mutationFn: async ({ playerId, discordId }: { playerId: string; discordId: string }) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/players/${playerId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to link player");
      }

      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Player Linked",
        description: `Successfully linked ${data.data.minecraftUsername} to Discord user.`,
      });
      queryClient.invalidateQueries({ queryKey: ["minecraft-players"] });
      setShowLinkDialog(false);
      setLinkDiscordId("");
      setSelectedPlayerId("");
    },
    onError: (error) => {
      toast({
        title: "Link Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Edit player mutation
  const editMutation = useMutation({
    mutationFn: async ({ playerId, playerData }: { playerId: string; playerData: typeof editPlayerData }) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const updateData: any = {
        minecraftUsername: playerData.minecraftUsername.trim(),
        discordId: playerData.discordId.trim() || undefined,
        notes: playerData.notes.trim() || undefined,
      };

      // Only include UUID if it's not empty (allow removal by leaving blank)
      if (playerData.minecraftUuid.trim()) {
        updateData.minecraftUuid = playerData.minecraftUuid.trim();
      } else {
        // Explicitly set to null to remove the UUID
        updateData.minecraftUuid = null;
      }

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/players/${playerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update player");
      }

      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Player Updated",
        description: `Successfully updated ${data.data.minecraftUsername}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["minecraft-players"] });
      setShowEditDialog(false);
      setEditingPlayer(null);
      setEditPlayerData({
        minecraftUsername: "",
        minecraftUuid: "",
        discordId: "",
        notes: "",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
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

    // Add link button for players without Discord ID
    if (!player.discordId) {
      actions.push(
        <Button
          key="link"
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelectedPlayerId(player._id);
            setShowLinkDialog(true);
          }}
          className="flex items-center gap-2">
          <Link className="h-4 w-4" />
          Link Discord
        </Button>
      );
    }

    // Add edit button for all players
    actions.push(
      <Button
        key="edit"
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditingPlayer(player);
          setEditPlayerData({
            minecraftUsername: player.minecraftUsername,
            minecraftUuid: player.minecraftUuid || "",
            discordId: player.discordId || "",
            notes: player.notes || "",
          });
          setShowEditDialog(true);
        }}
        className="flex items-center gap-2">
        <Edit className="h-4 w-4" />
        Edit
      </Button>
    );

    return actions;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minecraft Players</h1>
          <p className="text-muted-foreground">Manage player whitelist and linking status for {selectedGuild?.guildName}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)} className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Whitelist
          </Button>
          <Button asChild>
            <a href="/minecraft">← Back to Overview</a>
          </Button>
        </div>
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
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Players List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Players ({filteredPlayers.length})
          </CardTitle>
          <CardDescription>{statusFilter === "all" ? "All registered players" : `Players with status: ${statusFilter}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">{searchQuery || statusFilter !== "all" ? "No players match your filters" : "No players found"}</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== "all" ? "Try adjusting your search or filter criteria." : "Players will appear here once they start linking their accounts."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPlayers.map((player: MinecraftPlayer) => (
                <div key={player._id} className="flex items-center justify-between p-4 border rounded-lg bg-card">
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
                        <Avatar className="border-2 border-discord-primary">
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
                        <span className="font-medium text-white">{player.minecraftUsername}</span>
                        {getStatusBadge(player.whitelistStatus)}
                        {player.discordId && (
                          <Badge variant="outline" className="text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            Linked
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-discord-muted space-x-2">
                        {player.discordId && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">Discord: {player.discordDisplayName || player.discordUsername || "Discord User"}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-sm">
                                  <div>
                                    <strong>Discord ID:</strong> {player.discordId}
                                  </div>
                                  {player.discordUsername && (
                                    <div>
                                      <strong>Username:</strong> @{player.discordUsername}
                                    </div>
                                  )}
                                  {player.discordDisplayName && player.discordDisplayName !== player.discordUsername && (
                                    <div>
                                      <strong>Display Name:</strong> {player.discordDisplayName}
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
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

      {/* Import Whitelist Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-semibold mb-4">Import Whitelist</h3>
            <p className="text-muted-foreground mb-4">Upload a Minecraft whitelist.json file to import players. Players will be marked as whitelisted but not linked to Discord accounts.</p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="whitelist-file">Whitelist File</Label>
                <Input id="whitelist-file" type="file" accept=".json" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="mt-1" />
              </div>
              {importFile && <div className="text-sm text-muted-foreground">Selected: {importFile.name}</div>}
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportDialog(false);
                  setImportFile(null);
                }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (importFile) {
                    importMutation.mutate(importFile);
                  }
                }}
                disabled={!importFile || importMutation.isPending}>
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Link Discord Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-semibold mb-4">Link Discord Account</h3>
            <p className="text-muted-foreground mb-4">Enter the Discord user ID to manually link this Minecraft player to a Discord account.</p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="discord-id">Discord User ID</Label>
                <Input id="discord-id" type="text" placeholder="123456789012345678" value={linkDiscordId} onChange={(e) => setLinkDiscordId(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowLinkDialog(false);
                  setLinkDiscordId("");
                  setSelectedPlayerId("");
                }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (linkDiscordId && selectedPlayerId) {
                    linkMutation.mutate({ playerId: selectedPlayerId, discordId: linkDiscordId });
                  }
                }}
                disabled={!linkDiscordId || !selectedPlayerId || linkMutation.isPending}>
                {linkMutation.isPending ? "Linking..." : "Link Account"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Player Dialog */}
      {showEditDialog && editingPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-semibold mb-4 text-white">Edit Player</h3>
            <p className="text-muted-foreground mb-4">Update the player's information. Leave UUID empty to remove it.</p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-username">Minecraft Username</Label>
                <Input
                  id="edit-username"
                  type="text"
                  placeholder="Minecraft username"
                  value={editPlayerData.minecraftUsername}
                  onChange={(e) => setEditPlayerData((prev) => ({ ...prev, minecraftUsername: e.target.value }))}
                  className="mt-1 bg-discord-darker border-discord-darker text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-uuid">Minecraft UUID (Optional)</Label>
                <Input
                  id="edit-uuid"
                  type="text"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (leave empty to remove)"
                  value={editPlayerData.minecraftUuid}
                  onChange={(e) => setEditPlayerData((prev) => ({ ...prev, minecraftUuid: e.target.value }))}
                  className="mt-1 bg-discord-darker border-discord-darker text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-discord-id">Discord ID (Optional)</Label>
                <Input
                  id="edit-discord-id"
                  type="text"
                  placeholder="123456789012345678"
                  value={editPlayerData.discordId}
                  onChange={(e) => setEditPlayerData((prev) => ({ ...prev, discordId: e.target.value }))}
                  className="mt-1 bg-discord-darker border-discord-darker text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-notes">Notes (Optional)</Label>
                <Textarea
                  id="edit-notes"
                  placeholder="Additional notes about this player..."
                  value={editPlayerData.notes}
                  onChange={(e) => setEditPlayerData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 bg-discord-darker border-discord-darker text-white min-h-20"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingPlayer(null);
                  setEditPlayerData({
                    minecraftUsername: "",
                    minecraftUuid: "",
                    discordId: "",
                    notes: "",
                  });
                }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editPlayerData.minecraftUsername.trim() && editingPlayer) {
                    editMutation.mutate({
                      playerId: editingPlayer._id,
                      playerData: editPlayerData,
                    });
                  }
                }}
                disabled={!editPlayerData.minecraftUsername.trim() || editMutation.isPending}>
                {editMutation.isPending ? "Updating..." : "Update Player"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
