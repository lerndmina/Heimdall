"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { User, Users, Clock, CheckCircle, AlertCircle, Settings, Server, Shield, Plus, Upload, FileText } from "lucide-react";
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
      toast({
        title: "Bulk Approval Completed",
        description: `Successfully approved ${data.data.approved} players. ${data.data.errors > 0 ? `${data.data.errors} errors occurred.` : ""}`,
      });
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
                  <Button variant="outline" size="sm" onClick={() => bulkApproveMutation.mutate(Math.min(5, actualPendingCount))} disabled={bulkApproveMutation.isPending}>
                    {bulkApproveMutation.isPending ? "Approving..." : `Approve Oldest 5`}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => bulkApproveMutation.mutate(Math.min(10, actualPendingCount))} disabled={bulkApproveMutation.isPending}>
                    {bulkApproveMutation.isPending ? "Approving..." : `Approve Oldest 10`}
                  </Button>
                  {actualPendingCount > 10 && (
                    <Button variant="outline" size="sm" onClick={() => bulkApproveMutation.mutate(actualPendingCount)} disabled={bulkApproveMutation.isPending}>
                      {bulkApproveMutation.isPending ? "Approving..." : `Approve All ${actualPendingCount}`}
                    </Button>
                  )}
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
    </div>
  );
}
