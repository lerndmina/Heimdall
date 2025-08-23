"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { User, Users, Clock, CheckCircle, AlertCircle, Settings, Server, Shield, Plus, Upload, FileText, Copy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  discordUsername?: string;
  discordDisplayName?: string;
}

export function MinecraftDashboard() {
  const { selectedGuild } = useRequireGuild();
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Import whitelist state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState("");
  const [importMethod, setImportMethod] = useState<"file" | "text">("file");

  // Bulk whitelist state
  const [showBulkWhitelistDialog, setShowBulkWhitelistDialog] = useState(false);
  const [bulkWhitelistMethod, setBulkWhitelistMethod] = useState<"recent" | "all" | "manual">("recent");
  const [bulkWhitelistCount, setBulkWhitelistCount] = useState(5);
  const [bulkWhitelistUsernames, setBulkWhitelistUsernames] = useState("");

  // Manual player creation state
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualPlayerData, setManualPlayerData] = useState({
    minecraftUsername: "",
    minecraftUuid: "",
    discordId: "",
    notes: "",
  });

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

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (count: number) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/bulk-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          staffMemberId: session?.user?.id || "unknown",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to bulk approve players");
      }

      return result;
    },
    onSuccess: (data) => {
      const approvedPlayers = data.data.approvedPlayers || [];

      let description = `Successfully approved ${data.data.approved} players.`;
      if (data.data.errors > 0) {
        description += ` ${data.data.errors} errors occurred.`;
      }
      if (approvedPlayers.length > 0) {
        description += ` Click the copy button to get the player list.`;
      }

      toast({
        title: "Bulk Approval Completed",
        description,
      });

      // Auto-copy the player list to clipboard if any players were approved
      if (approvedPlayers.length > 0) {
        setTimeout(async () => {
          try {
            const playerList = approvedPlayers.join("\n");
            await navigator.clipboard.writeText(playerList);
            toast({
              title: "Player List Copied",
              description: `${approvedPlayers.length} usernames copied to clipboard (newline separated)`,
            });
          } catch (err) {
            console.error("Failed to copy:", err);
            toast({
              title: "Copy Available",
              description: `Approved players: ${approvedPlayers.join(", ")}`,
            });
          }
        }, 500);
      }

      // Refresh both queries
      queryClient.invalidateQueries({ queryKey: ["minecraft-pending"] });
      queryClient.invalidateQueries({ queryKey: ["minecraft-stats"] });
    },
    onError: (error) => {
      toast({
        title: "Bulk Approval Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk manual whitelist mutation
  const bulkManualWhitelistMutation = useMutation({
    mutationFn: async (usernames: string[]) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/bulk-whitelist-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernames,
          staffMemberId: session?.user?.id || "unknown",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to bulk whitelist players");
      }

      return result;
    },
    onSuccess: (data) => {
      const summary = data.data;

      let description = `Processed ${summary.processed} players. Created: ${summary.created}, Updated: ${summary.updated}`;
      if (summary.errors > 0) {
        description += `, Errors: ${summary.errors}`;
      }

      toast({
        title: "Bulk Manual Whitelist Completed",
        description,
      });

      // Auto-copy the processed player list to clipboard if any players were processed
      if (summary.processedPlayers.length > 0) {
        setTimeout(async () => {
          try {
            const playerList = summary.processedPlayers.join("\n");
            await navigator.clipboard.writeText(playerList);
            toast({
              title: "Player List Copied",
              description: `${summary.processedPlayers.length} usernames copied to clipboard (newline separated)`,
            });
          } catch (err) {
            console.error("Failed to copy:", err);
            toast({
              title: "Copy Available",
              description: `Processed players: ${summary.processedPlayers.join(", ")}`,
            });
          }
        }, 500);
      }

      // Show errors if any
      if (summary.errors > 0) {
        setTimeout(() => {
          toast({
            title: "Some Errors Occurred",
            description: `${summary.errors} players could not be processed. Check logs for details.`,
            variant: "destructive",
          });
        }, 1000);
      }

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ["minecraft-players"] });
      queryClient.invalidateQueries({ queryKey: ["minecraft-stats"] });
    },
    onError: (error) => {
      toast({
        title: "Bulk Manual Whitelist Failed",
        description: error.message,
        variant: "destructive",
      });
    },
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

  // Import whitelist mutation
  const importMutation = useMutation({
    mutationFn: async (data: { method: "file" | "text"; file?: File; text?: string }) => {
      if (!selectedGuild) throw new Error("No guild selected");

      let whitelistData;

      try {
        if (data.method === "file" && data.file) {
          const text = await data.file.text();
          whitelistData = JSON.parse(text);
        } else if (data.method === "text" && data.text) {
          whitelistData = JSON.parse(data.text);
        } else {
          throw new Error("No data provided");
        }
      } catch (parseError) {
        throw new Error("Invalid JSON format");
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
      queryClient.invalidateQueries({ queryKey: ["minecraft-stats"] });
      setShowImportDialog(false);
      setImportFile(null);
      setImportText("");
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Manual player creation mutation
  const manualCreateMutation = useMutation({
    mutationFn: async (playerData: typeof manualPlayerData) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/players/manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...playerData,
          staffMemberId: session?.user?.id || "unknown",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create player");
      }

      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Player Created",
        description: `Successfully created player record for ${data.data.player.minecraftUsername}`,
      });
      queryClient.invalidateQueries({ queryKey: ["minecraft-stats"] });
      queryClient.invalidateQueries({ queryKey: ["minecraft-pending"] });
      setShowManualDialog(false);
      setManualPlayerData({
        minecraftUsername: "",
        minecraftUuid: "",
        discordId: "",
        notes: "",
      });
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!selectedGuild) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-discord-warning" />
          <h3 className="mt-4 text-lg font-medium text-white">No Guild Selected</h3>
          <p className="text-discord-muted">Please select a guild to manage Minecraft integration.</p>
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
          <h1 className="text-3xl font-bold tracking-tight text-white">Minecraft Integration</h1>
          <p className="text-discord-text">Manage Minecraft account linking and whitelist approvals for {selectedGuild.guildName}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setShowManualDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Player
          </Button>
          <Button variant="outline" asChild>
            <a href="/minecraft/config">
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </a>
          </Button>
          <Button asChild>
            <a href="/minecraft/players">
              <Users className="h-4 w-4 mr-2" />
              Manage Players
            </a>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-discord-text">Total Players</CardTitle>
            <Users className="h-4 w-4 text-discord-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{statsLoading ? "..." : updatedStats?.totalPlayers || 0}</div>
            <p className="text-xs text-discord-muted">All registered players</p>
          </CardContent>
        </Card>

        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-discord-text">Linked Accounts</CardTitle>
            <User className="h-4 w-4 text-discord-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{statsLoading ? "..." : updatedStats?.linkedPlayers || 0}</div>
            <p className="text-xs text-discord-muted">Discord accounts linked</p>
          </CardContent>
        </Card>

        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-discord-text">Whitelisted</CardTitle>
            <CheckCircle className="h-4 w-4 text-discord-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{statsLoading ? "..." : updatedStats?.whitelistedPlayers || 0}</div>
            <p className="text-xs text-discord-muted">Can join the server</p>
          </CardContent>
        </Card>

        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-discord-text">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-discord-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-discord-warning">{pendingLoading ? "..." : actualPendingCount}</div>
            <p className="text-xs text-discord-muted">Awaiting staff review</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals Section */}
      {actualPendingCount > 0 && (
        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Clock className="h-5 w-5 text-discord-warning" />
                  Pending Approvals ({actualPendingCount})
                </CardTitle>
                <CardDescription className="text-discord-muted">Review and approve Discord users who want to link their Minecraft accounts</CardDescription>
              </div>
              {actualPendingCount > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-discord-muted">Queue processing:</span>
                  <Button variant="outline" size="sm" onClick={() => setShowBulkWhitelistDialog(true)} disabled={bulkApproveMutation.isPending}>
                    <Users className="h-4 w-4 mr-2" />
                    Bulk Whitelist
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingApprovals?.map((auth: PendingAuth) => (
              <div key={auth._id} className="flex items-center justify-between p-4 border border-discord-darker rounded-lg bg-discord-darker/50">
                <div className="flex items-center space-x-4">
                  <Avatar>
                    <AvatarImage src={`https://cdn.discordapp.com/avatars/${auth.discordId}/avatar.png`} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-medium text-white cursor-help">
                              <User className="inline h-4 w-4 mr-1" />
                              {auth.discordDisplayName || auth.discordUsername || `User#${auth.discordId}`}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-sm">
                              <div>
                                <strong>Username:</strong> {auth.discordUsername || "Unknown"}
                              </div>
                              <div>
                                <strong>Discord ID:</strong> {auth.discordId}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Badge variant="secondary">→</Badge>
                      <span className="font-medium text-white">
                        <Server className="inline h-4 w-4 mr-1" />
                        {auth.minecraftUsername}
                      </span>
                    </div>
                    <div className="text-sm text-discord-muted">Confirmed: {new Date(auth.confirmedAt).toLocaleString()}</div>
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
      <Card className="bg-discord-dark border-discord-darker">
        <CardHeader>
          <CardTitle className="text-white">Quick Actions</CardTitle>
          <CardDescription className="text-discord-muted">Common minecraft management tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button variant="outline" asChild>
            <a href="/minecraft/players">
              <Users className="h-4 w-4 mr-2" />
              View All Players
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/minecraft/config">
              <Settings className="h-4 w-4 mr-2" />
              Server Configuration
            </a>
          </Button>
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import Whitelist
          </Button>
        </CardContent>
      </Card>

      {/* Import Whitelist Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-semibold mb-4 text-white">Import Whitelist</h3>
            <p className="text-discord-text mb-4">Import players from a Minecraft whitelist. Choose to upload a JSON file or paste the content directly.</p>

            {/* Method Selection */}
            <div className="space-y-4">
              <div>
                <Label className="text-discord-text">Import Method</Label>
                <div className="flex space-x-4 mt-2">
                  <Button variant={importMethod === "file" ? "default" : "outline"} size="sm" onClick={() => setImportMethod("file")}>
                    <FileText className="h-4 w-4 mr-2" />
                    Upload File
                  </Button>
                  <Button variant={importMethod === "text" ? "default" : "outline"} size="sm" onClick={() => setImportMethod("text")}>
                    <Upload className="h-4 w-4 mr-2" />
                    Paste JSON
                  </Button>
                </div>
              </div>

              {importMethod === "file" ? (
                <div>
                  <Label htmlFor="whitelist-file" className="text-discord-text">
                    Whitelist File
                  </Label>
                  <Input id="whitelist-file" type="file" accept=".json" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="mt-1" />
                  {importFile && <div className="text-sm text-discord-muted mt-2">Selected: {importFile.name}</div>}
                </div>
              ) : (
                <div>
                  <Label htmlFor="whitelist-text" className="text-discord-text">
                    Whitelist JSON
                  </Label>
                  <Textarea
                    id="whitelist-text"
                    placeholder='[{"name": "PlayerName", "uuid": "player-uuid-here"}, ...]'
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    className="mt-1 h-32"
                  />
                  {importText && <div className="text-sm text-discord-muted mt-2">{importText.length} characters entered</div>}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportDialog(false);
                  setImportFile(null);
                  setImportText("");
                  setImportMethod("file");
                }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (importMethod === "file" && importFile) {
                    importMutation.mutate({ method: "file", file: importFile });
                  } else if (importMethod === "text" && importText.trim()) {
                    importMutation.mutate({ method: "text", text: importText });
                  }
                }}
                disabled={(importMethod === "file" && !importFile) || (importMethod === "text" && !importText.trim()) || importMutation.isPending}>
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Player Creation Dialog */}
      {showManualDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-semibold mb-4 text-white">Add Player Manually</h3>
            <p className="text-discord-text mb-4">Create a player record manually by providing their Minecraft username, UUID (optional), and Discord ID.</p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="manual-username" className="text-discord-text">
                  Minecraft Username *
                </Label>
                <Input
                  id="manual-username"
                  placeholder="PlayerName"
                  value={manualPlayerData.minecraftUsername}
                  onChange={(e) => setManualPlayerData((prev) => ({ ...prev, minecraftUsername: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="manual-uuid" className="text-discord-text">
                  Minecraft UUID (Optional)
                </Label>
                <Input
                  id="manual-uuid"
                  placeholder="550e8400-e29b-41d4-a716-446655440000"
                  value={manualPlayerData.minecraftUuid}
                  onChange={(e) => setManualPlayerData((prev) => ({ ...prev, minecraftUuid: e.target.value }))}
                  className="mt-1"
                />
                <div className="text-sm text-discord-muted mt-1">Leave empty if unknown. Will be auto-filled when player joins.</div>
              </div>

              <div>
                <Label htmlFor="manual-discord" className="text-discord-text">
                  Discord User ID *
                </Label>
                <Input
                  id="manual-discord"
                  placeholder="123456789012345678"
                  value={manualPlayerData.discordId}
                  onChange={(e) => setManualPlayerData((prev) => ({ ...prev, discordId: e.target.value }))}
                  className="mt-1"
                />
                <div className="text-sm text-discord-muted mt-1">Right-click user in Discord → Copy User ID (Developer Mode required)</div>
              </div>

              <div>
                <Label htmlFor="manual-notes" className="text-discord-text">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="manual-notes"
                  placeholder="Additional notes about this player..."
                  value={manualPlayerData.notes}
                  onChange={(e) => setManualPlayerData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 h-20"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowManualDialog(false);
                  setManualPlayerData({
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
                  if (manualPlayerData.minecraftUsername.trim() && manualPlayerData.discordId.trim()) {
                    manualCreateMutation.mutate(manualPlayerData);
                  }
                }}
                disabled={!manualPlayerData.minecraftUsername.trim() || !manualPlayerData.discordId.trim() || manualCreateMutation.isPending}>
                {manualCreateMutation.isPending ? "Creating..." : "Create Player"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Whitelist Dialog */}
      {showBulkWhitelistDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-semibold mb-4 text-white">Bulk Whitelist</h3>
            <p className="text-discord-text mb-4">Choose how you want to whitelist multiple players from the pending approvals queue.</p>

            {/* Method Selection */}
            <div className="space-y-4">
              <div>
                <Label className="text-discord-text">Whitelist Method</Label>
                <div className="flex space-x-2 mt-2">
                  <Button variant={bulkWhitelistMethod === "recent" ? "default" : "outline"} size="sm" onClick={() => setBulkWhitelistMethod("recent")} className="flex-1">
                    <Clock className="h-4 w-4 mr-2" />
                    Most Recent
                  </Button>
                  <Button variant={bulkWhitelistMethod === "all" ? "default" : "outline"} size="sm" onClick={() => setBulkWhitelistMethod("all")} className="flex-1">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    All Pending
                  </Button>
                  <Button variant={bulkWhitelistMethod === "manual" ? "default" : "outline"} size="sm" onClick={() => setBulkWhitelistMethod("manual")} className="flex-1">
                    <FileText className="h-4 w-4 mr-2" />
                    Manual List
                  </Button>
                </div>
              </div>

              {bulkWhitelistMethod === "recent" && (
                <div>
                  <Label htmlFor="bulk-count" className="text-discord-text">
                    Number of Players
                  </Label>
                  <Input
                    id="bulk-count"
                    type="number"
                    min="1"
                    max={actualPendingCount}
                    value={bulkWhitelistCount}
                    onChange={(e) => setBulkWhitelistCount(Math.max(1, Math.min(actualPendingCount, parseInt(e.target.value) || 1)))}
                    className="mt-1"
                  />
                  <div className="text-sm text-discord-muted mt-2">Will approve the {bulkWhitelistCount} oldest pending requests</div>
                </div>
              )}

              {bulkWhitelistMethod === "all" && (
                <div className="p-3 bg-discord-darker/50 rounded-lg border border-discord-darker">
                  <div className="flex items-center gap-2 text-discord-warning">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">All Pending Approvals</span>
                  </div>
                  <div className="text-sm text-discord-muted mt-1">This will approve all {actualPendingCount} pending requests</div>
                </div>
              )}

              {bulkWhitelistMethod === "manual" && (
                <div>
                  <Label htmlFor="bulk-usernames" className="text-discord-text">
                    Usernames to Whitelist
                  </Label>
                  <Textarea
                    id="bulk-usernames"
                    placeholder="Enter Minecraft usernames, one per line:&#10;PlayerName1&#10;PlayerName2&#10;PlayerName3"
                    value={bulkWhitelistUsernames}
                    onChange={(e) => setBulkWhitelistUsernames(e.target.value)}
                    className="mt-1 h-32"
                  />
                  {bulkWhitelistUsernames && <div className="text-sm text-discord-muted mt-2">{bulkWhitelistUsernames.split("\n").filter((line) => line.trim()).length} usernames entered</div>}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkWhitelistDialog(false);
                  setBulkWhitelistMethod("recent");
                  setBulkWhitelistCount(5);
                  setBulkWhitelistUsernames("");
                }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (bulkWhitelistMethod === "recent") {
                    bulkApproveMutation.mutate(bulkWhitelistCount);
                    setShowBulkWhitelistDialog(false);
                    setBulkWhitelistMethod("recent");
                    setBulkWhitelistCount(5);
                    setBulkWhitelistUsernames("");
                  } else if (bulkWhitelistMethod === "all") {
                    bulkApproveMutation.mutate(actualPendingCount);
                    setShowBulkWhitelistDialog(false);
                    setBulkWhitelistMethod("recent");
                    setBulkWhitelistCount(5);
                    setBulkWhitelistUsernames("");
                  } else if (bulkWhitelistMethod === "manual") {
                    const usernames = bulkWhitelistUsernames.split("\n").filter((line) => line.trim());
                    if (usernames.length > 0) {
                      bulkManualWhitelistMutation.mutate(usernames);
                      setShowBulkWhitelistDialog(false);
                      setBulkWhitelistMethod("recent");
                      setBulkWhitelistCount(5);
                      setBulkWhitelistUsernames("");
                    }
                  }
                }}
                disabled={
                  bulkApproveMutation.isPending ||
                  bulkManualWhitelistMutation.isPending ||
                  (bulkWhitelistMethod === "recent" && bulkWhitelistCount < 1) ||
                  (bulkWhitelistMethod === "manual" && !bulkWhitelistUsernames.trim())
                }>
                {bulkApproveMutation.isPending || bulkManualWhitelistMutation.isPending ? "Processing..." : "Whitelist Players"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
