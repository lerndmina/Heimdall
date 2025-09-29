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

interface RoleMapping {
  discordRoleId: string;
  discordRoleName: string;
  minecraftGroup: string;
  enabled: boolean;
}

interface MinecraftConfig {
  _id?: string;
  guildId: string;
  enabled: boolean;
  serverHost: string;
  serverPort: number;
  authCodeExpiry: number;
  maxPendingAuths: number;
  requireConfirmation: boolean;
  allowUsernameChange: boolean;
  autoWhitelist: boolean;
  roleSync: {
    enabled: boolean;
    enableCaching: boolean;
    roleMappings: RoleMapping[];
  };
  authSuccessMessage: string;
  authRejectionMessage: string;
  authPendingMessage: string;
  applicationRejectionMessage: string;
  updatedAt?: string;
  createdAt?: string;
}

const defaultConfig: Partial<MinecraftConfig> = {
  enabled: false,
  serverHost: "",
  serverPort: 25565,
  authCodeExpiry: 300, // 5 minutes
  maxPendingAuths: 10,
  requireConfirmation: true,
  allowUsernameChange: true,
  autoWhitelist: false,
  roleSync: {
    enabled: false,
    enableCaching: true,
    roleMappings: [],
  },
  authSuccessMessage: "✅ Your Minecraft account has been successfully linked! You can now join the server.",
  authRejectionMessage: "❌ To join this server:\n• Join the Discord server\n• Use /link-minecraft {username}\n• Follow the instructions to link your account",
  authPendingMessage: "⏳ Your account is linked and waiting for staff approval.\nPlease be patient while staff review your request.\nYou will be automatically whitelisted once approved.",
  applicationRejectionMessage: "❌ Your whitelist application has been rejected. Please contact staff for more information.",
};

export function MinecraftConfig() {
  const { selectedGuild } = useRequireGuild();
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<MinecraftConfig>({
    ...defaultConfig,
    guildId: "",
    roleSync: {
      enabled: false,
      enableCaching: true,
      roleMappings: [],
    },
  } as MinecraftConfig);
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
      // Ensure nested objects exist with defaults for backward compatibility
      const safeConfig = {
        ...defaultConfig,
        ...currentConfig,
        roleSync: {
          enabled: false,
          enableCaching: true,
          roleMappings: [],
          ...(currentConfig.roleSync || {}),
        },
      };
      setConfig(safeConfig as MinecraftConfig);
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
      const wasEnabled = currentConfig?.enabled;
      const isNowEnabled = config.enabled;

      let title = "Configuration Saved";
      let description = "Minecraft integration settings have been updated.";

      if (!wasEnabled && isNowEnabled) {
        title = "🎉 Minecraft Integration Enabled!";
        description = "Players can now connect to your server and link their Discord accounts.";
      } else if (wasEnabled && !isNowEnabled) {
        title = "⚠️ Integration Disabled";
        description = "Minecraft integration has been disabled. Players cannot connect until re-enabled.";
      }

      toast({
        title,
        description,
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

      {/* Enable Integration Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Integration Status
          </CardTitle>
          <CardDescription>
            {config.enabled
              ? "Minecraft integration is currently enabled. Players can link their accounts and join the server."
              : "Minecraft integration is disabled. Enable it to start accepting player connections and account linking."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Switch id="enabled" checked={config.enabled} onCheckedChange={(checked) => handleInputChange("enabled", checked)} />
            <Label htmlFor="enabled" className="text-sm font-medium">
              {config.enabled ? "Integration Enabled" : "Integration Disabled"}
            </Label>
          </div>
          {!config.enabled && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Integration Disabled:</strong> Players cannot connect to your Minecraft server until you enable the integration and configure the settings below.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Server Configuration */}
      <Card className={config.enabled ? "" : "opacity-60"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server Settings
            {!config.enabled && <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded">Requires Integration Enabled</span>}
          </CardTitle>
          <CardDescription>Basic minecraft server configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serverHost">Server Host</Label>
              <Input id="serverHost" placeholder="play.yourserver.com" value={config.serverHost} onChange={(e) => handleInputChange("serverHost", e.target.value)} disabled={!config.enabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serverPort">Server Port</Label>
              <Input
                id="serverPort"
                type="number"
                placeholder="25565"
                value={config.serverPort}
                onChange={(e) => handleInputChange("serverPort", parseInt(e.target.value) || 25565)}
                disabled={!config.enabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authentication Settings */}
      <Card className={config.enabled ? "" : "opacity-60"}>
        <CardHeader>
          <CardTitle>
            Authentication Settings
            {!config.enabled && <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded ml-2">Requires Integration Enabled</span>}
          </CardTitle>
          <CardDescription>Control how players link their accounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="authCodeExpiry">Auth Code Expiry (seconds)</Label>
              <Input
                id="authCodeExpiry"
                type="number"
                value={config.authCodeExpiry}
                onChange={(e) => handleInputChange("authCodeExpiry", parseInt(e.target.value) || 300)}
                disabled={!config.enabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPendingAuths">Max Pending Applications</Label>
              <Input
                id="maxPendingAuths"
                type="number"
                value={config.maxPendingAuths}
                onChange={(e) => handleInputChange("maxPendingAuths", parseInt(e.target.value) || 10)}
                disabled={!config.enabled}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch id="requireConfirmation" checked={config.requireConfirmation} onCheckedChange={(checked) => handleInputChange("requireConfirmation", checked)} disabled={!config.enabled} />
              <Label htmlFor="requireConfirmation">Require code confirmation</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="allowUsernameChange" checked={config.allowUsernameChange} onCheckedChange={(checked) => handleInputChange("allowUsernameChange", checked)} disabled={!config.enabled} />
              <Label htmlFor="allowUsernameChange">Allow username changes</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="autoWhitelist" checked={config.autoWhitelist} onCheckedChange={(checked) => handleInputChange("autoWhitelist", checked)} disabled={!config.enabled} />
              <Label htmlFor="autoWhitelist">Auto-whitelist approved players</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role Sync Settings */}
      <Card className={config.enabled ? "" : "opacity-60"}>
        <CardHeader>
          <CardTitle>
            Role Sync Settings
            {!config.enabled && <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded ml-2">Requires Integration Enabled</span>}
          </CardTitle>
          <CardDescription>Synchronize Discord roles with Minecraft server groups</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="roleSyncEnabled"
              checked={config.roleSync.enabled}
              onCheckedChange={(checked) => handleInputChange("roleSync", { ...config.roleSync, enabled: checked })}
              disabled={!config.enabled}
            />
            <Label htmlFor="roleSyncEnabled">Enable Role Sync</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="enableCaching"
              checked={config.roleSync.enableCaching}
              onCheckedChange={(checked) => handleInputChange("roleSync", { ...config.roleSync, enableCaching: checked })}
              disabled={!config.enabled}
            />
            <Label htmlFor="enableCaching">Enable Whitelist Caching</Label>
          </div>

          {config.roleSync.enabled && (
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Discord Role → Minecraft Group Mappings</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newMapping: RoleMapping = {
                      discordRoleId: "",
                      discordRoleName: "",
                      minecraftGroup: "",
                      enabled: true,
                    };
                    handleInputChange("roleSync", {
                      ...config.roleSync,
                      roleMappings: [...config.roleSync.roleMappings, newMapping],
                    });
                  }}
                  disabled={!config.enabled}>
                  Add Mapping
                </Button>
              </div>

              {config.roleSync.roleMappings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No role mappings configured. Add a mapping to sync Discord roles with Minecraft groups.</p>
              ) : (
                <div className="space-y-2">
                  {config.roleSync.roleMappings.map((mapping, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center p-2 border rounded">
                      <div className="space-y-1">
                        <Label className="text-xs">Discord Role ID</Label>
                        <Input
                          placeholder="123456789012345678"
                          value={mapping.discordRoleId}
                          onChange={(e) => {
                            const newMappings = [...config.roleSync.roleMappings];
                            newMappings[index] = { ...mapping, discordRoleId: e.target.value };
                            handleInputChange("roleSync", { ...config.roleSync, roleMappings: newMappings });
                          }}
                          disabled={!config.enabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Role Name (Display)</Label>
                        <Input
                          placeholder="VIP"
                          value={mapping.discordRoleName}
                          onChange={(e) => {
                            const newMappings = [...config.roleSync.roleMappings];
                            newMappings[index] = { ...mapping, discordRoleName: e.target.value };
                            handleInputChange("roleSync", { ...config.roleSync, roleMappings: newMappings });
                          }}
                          disabled={!config.enabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Minecraft Group</Label>
                        <Input
                          placeholder="vip"
                          value={mapping.minecraftGroup}
                          onChange={(e) => {
                            const newMappings = [...config.roleSync.roleMappings];
                            newMappings[index] = { ...mapping, minecraftGroup: e.target.value };
                            handleInputChange("roleSync", { ...config.roleSync, roleMappings: newMappings });
                          }}
                          disabled={!config.enabled}
                        />
                      </div>
                      <div className="flex items-center justify-end space-x-2">
                        <Switch
                          checked={mapping.enabled}
                          onCheckedChange={(checked) => {
                            const newMappings = [...config.roleSync.roleMappings];
                            newMappings[index] = { ...mapping, enabled: checked };
                            handleInputChange("roleSync", { ...config.roleSync, roleMappings: newMappings });
                          }}
                          disabled={!config.enabled}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            const newMappings = config.roleSync.roleMappings.filter((_, i) => i !== index);
                            handleInputChange("roleSync", { ...config.roleSync, roleMappings: newMappings });
                          }}
                          disabled={!config.enabled}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Templates */}
      <Card className={config.enabled ? "" : "opacity-60"}>
        <CardHeader>
          <CardTitle>
            Message Templates
            {!config.enabled && <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded ml-2">Requires Integration Enabled</span>}
          </CardTitle>
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
              disabled={!config.enabled}
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
              disabled={!config.enabled}
            />
            <p className="text-xs text-muted-foreground">Shown to players who don't have an account yet. Use {"{username}"} for username placeholder.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicationRejectionMessage">Application Rejection Message</Label>
            <Textarea
              id="applicationRejectionMessage"
              value={config.applicationRejectionMessage}
              onChange={(e) => handleInputChange("applicationRejectionMessage", e.target.value)}
              rows={2}
              placeholder="Message shown when player's application is rejected"
              disabled={!config.enabled}
            />
            <p className="text-xs text-muted-foreground">
              Shown to players who have been explicitly rejected. Use {"{username}"} and {"{reason}"} for placeholders.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="authPendingMessage">Pending Approval Message</Label>
            <Textarea
              id="authPendingMessage"
              value={config.authPendingMessage}
              onChange={(e) => handleInputChange("authPendingMessage", e.target.value)}
              rows={3}
              placeholder="Message shown when player is linked but waiting for staff approval"
              disabled={!config.enabled}
            />
            <p className="text-sm text-muted-foreground">Shown to players who have linked their account but are waiting for staff approval. Use {"{username}"} for placeholder.</p>
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
