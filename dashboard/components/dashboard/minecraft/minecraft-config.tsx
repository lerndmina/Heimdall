"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Save, Server, AlertCircle, CheckCircle, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRequireGuild } from "../use-require-guild";

interface MinecraftConfig {
  _id?: string;
  guildId: string;
  serverHost: string;
  serverPort: number;
  authCodeExpiry: number;
  maxPendingAuths: number;
  requireConfirmation: boolean;
  allowUsernameChange: boolean;
  autoWhitelist: boolean;
  authSuccessMessage: string;
  authRejectionMessage: string;
  whitelistSuccessMessage: string;
  updatedAt?: string;
  createdAt?: string;
}

const defaultConfig: Partial<MinecraftConfig> = {
  serverHost: "",
  serverPort: 25565,
  authCodeExpiry: 300, // 5 minutes
  maxPendingAuths: 10,
  requireConfirmation: true,
  allowUsernameChange: true,
  autoWhitelist: false,
  authSuccessMessage: "✅ Your Minecraft account has been successfully linked! You can now join the server.",
  authRejectionMessage: "❌ Your whitelist application has been rejected. Please contact staff for more information.",
  whitelistSuccessMessage: "🎉 You have been whitelisted! You can now join the Minecraft server.",
};

export function MinecraftConfig() {
  const { selectedGuild } = useRequireGuild();
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<MinecraftConfig>({ ...defaultConfig, guildId: "" } as MinecraftConfig);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current config
  const {
    data: currentConfig,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["minecraft-config", selectedGuild?.guildId],
    queryFn: async () => {
      if (!selectedGuild) return null;

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/config`);
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          // No config exists yet, return default
          return { ...defaultConfig, guildId: selectedGuild.guildId };
        }
        throw new Error(result.error || "Failed to fetch config");
      }

      return result.data;
    },
    enabled: !!selectedGuild,
  });

  // Update form when data loads
  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
      setHasChanges(false);
    }
  }, [currentConfig]);

  // Save config mutation
  const saveMutation = useMutation({
    mutationFn: async (configData: MinecraftConfig) => {
      if (!selectedGuild) throw new Error("No guild selected");

      const response = await fetch(`/api/minecraft/${selectedGuild.guildId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configData),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save config");
      }

      return result;
    },
    onSuccess: () => {
      toast({
        title: "Configuration Saved",
        description: "Minecraft integration settings have been updated.",
      });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["minecraft-config"] });
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof MinecraftConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!selectedGuild) return;
    saveMutation.mutate({ ...config, guildId: selectedGuild.guildId });
  };

  if (!selectedGuild) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No Guild Selected</h3>
          <p className="text-muted-foreground">Please select a guild to configure minecraft integration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minecraft Configuration</h1>
          <p className="text-muted-foreground">Configure minecraft server integration for {selectedGuild.guildName}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" asChild>
            <a href="/minecraft">← Back to Overview</a>
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Server Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server Settings
          </CardTitle>
          <CardDescription>Basic minecraft server configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serverHost">Server Host</Label>
              <Input id="serverHost" placeholder="play.yourserver.com" value={config.serverHost} onChange={(e) => handleInputChange("serverHost", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serverPort">Server Port</Label>
              <Input id="serverPort" type="number" placeholder="25565" value={config.serverPort} onChange={(e) => handleInputChange("serverPort", parseInt(e.target.value) || 25565)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authentication Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Settings</CardTitle>
          <CardDescription>Control how players link their accounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="authCodeExpiry">Auth Code Expiry (seconds)</Label>
              <Input id="authCodeExpiry" type="number" value={config.authCodeExpiry} onChange={(e) => handleInputChange("authCodeExpiry", parseInt(e.target.value) || 300)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPendingAuths">Max Pending Applications</Label>
              <Input id="maxPendingAuths" type="number" value={config.maxPendingAuths} onChange={(e) => handleInputChange("maxPendingAuths", parseInt(e.target.value) || 10)} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch id="requireConfirmation" checked={config.requireConfirmation} onCheckedChange={(checked) => handleInputChange("requireConfirmation", checked)} />
              <Label htmlFor="requireConfirmation">Require code confirmation</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="allowUsernameChange" checked={config.allowUsernameChange} onCheckedChange={(checked) => handleInputChange("allowUsernameChange", checked)} />
              <Label htmlFor="allowUsernameChange">Allow username changes</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="autoWhitelist" checked={config.autoWhitelist} onCheckedChange={(checked) => handleInputChange("autoWhitelist", checked)} />
              <Label htmlFor="autoWhitelist">Auto-whitelist approved players</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Message Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Message Templates</CardTitle>
          <CardDescription>Customize messages sent to users and shown on server kicks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="authSuccessMessage">Authentication Success Message</Label>
            <Textarea
              id="authSuccessMessage"
              value={config.authSuccessMessage}
              onChange={(e) => handleInputChange("authSuccessMessage", e.target.value)}
              rows={2}
              placeholder="Message shown when auth code is provided"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authRejectionMessage">Authentication Rejection Message</Label>
            <Textarea
              id="authRejectionMessage"
              value={config.authRejectionMessage}
              onChange={(e) => handleInputChange("authRejectionMessage", e.target.value)}
              rows={2}
              placeholder="Message shown when player needs to link account"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whitelistSuccessMessage">Whitelist Success Message</Label>
            <Textarea
              id="whitelistSuccessMessage"
              value={config.whitelistSuccessMessage}
              onChange={(e) => handleInputChange("whitelistSuccessMessage", e.target.value)}
              rows={2}
              placeholder="Message shown when player has been whitelisted"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Changes */}
      {hasChanges && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span className="font-medium text-amber-800 dark:text-amber-200">You have unsaved changes</span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfig(currentConfig || ({ ...defaultConfig, guildId: selectedGuild.guildId } as MinecraftConfig));
                    setHasChanges(false);
                  }}>
                  Discard Changes
                </Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
