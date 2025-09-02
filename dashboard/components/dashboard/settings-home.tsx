"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequireGuild } from "./use-require-guild";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { useBotName } from "@/hooks/use-bot-info";
import { Settings, MessageSquare, Clock, Users, Shield, Bell, Palette, Save, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "../../hooks/use-toast";

interface ModmailConfig {
  guildId: string;
  guildDescription: string;
  forumChannelId: string;
  staffRoleId: string;
  inactivityWarningHours: number;
  autoCloseHours: number;
  enableAutoClose: boolean;
  enableInactivityWarning: boolean;
  typingIndicators: boolean;
  typingIndicatorStyle: "native" | "message" | "both";
  updatedAt?: string;
  tags?: Array<{
    name: string;
    emoji?: string;
    description?: string;
  }>;
}

// Simple Label component
const Label = ({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) => (
  <label htmlFor={htmlFor} className={`text-sm font-medium leading-none ${className || ""}`}>
    {children}
  </label>
);

// Simple Switch component
const Switch = ({ checked, onCheckedChange, className }: { checked: boolean; onCheckedChange: (checked: boolean) => void; className?: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onCheckedChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
      checked ? "bg-discord-primary" : "bg-discord-darker"
    } ${className || ""}`}>
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
  </button>
);

// Simple Select component
const Select = ({ value, onValueChange, children, className }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode; className?: string }) => (
  <select
    value={value}
    onChange={(e) => onValueChange(e.target.value)}
    className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
      className || ""
    }`}>
    {children}
  </select>
);

const SelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>;

// Simple Textarea component
const Textarea = ({
  value,
  onChange,
  placeholder,
  rows,
  className,
  id,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  id?: string;
}) => (
  <textarea
    id={id}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    rows={rows}
    className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
      className || ""
    }`}
  />
);

// Simple Separator component
const Separator = ({ className }: { className?: string }) => <div className={`h-[1px] w-full bg-border ${className || ""}`} />;

export function SettingsHome() {
  const { selectedGuild } = useRequireGuild();
  const botName = useBotName();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current modmail config
  const {
    data: config,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["modmail-config", selectedGuild?.guildId],
    queryFn: async () => {
      if (!selectedGuild) return null;
      return await apiClient.getModmailConfig(selectedGuild.guildId);
    },
    enabled: !!selectedGuild,
  });

  // Local state for form data
  const [formData, setFormData] = useState<Partial<ModmailConfig>>({
    guildDescription: "",
    forumChannelId: "",
    staffRoleId: "",
    inactivityWarningHours: 24,
    autoCloseHours: 72,
    enableAutoClose: false,
    enableInactivityWarning: false,
    typingIndicators: true,
    typingIndicatorStyle: "native",
    tags: [],
  });

  // Update form data when config loads
  useEffect(() => {
    if ((config as any)?.data) {
      console.log("Config received:", (config as any).data);
      console.log("typingIndicators value:", (config as any).data.typingIndicators);
      setFormData(prev => ({
        ...prev,
        ...(config as any).data,
        // Ensure default values are applied if fields are undefined
        typingIndicators: (config as any).data.typingIndicators ?? true,
        typingIndicatorStyle: (config as any).data.typingIndicatorStyle ?? "native",
      }));
    }
  }, [config]);

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (data: Partial<ModmailConfig>) => {
      if (!selectedGuild) throw new Error("No guild selected");
      console.log("Sending to API:", data);
      const result = await apiClient.updateModmailConfig(selectedGuild.guildId, data);
      console.log("API response:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("Save successful, invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["modmail-config", selectedGuild?.guildId] });
      toast({
        title: "Settings saved",
        description: "Your modmail configuration has been updated successfully.",
      });
    },
    onError: (error) => {
      console.error("Save failed:", error);
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleSave = async () => {
    setIsSaving(true);
    console.log("Saving formData:", formData);
    try {
      await saveSettingsMutation.mutateAsync(formData);
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedGuild) {
    return null; // The hook will handle redirection
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-discord-muted">Configure settings for {selectedGuild.guildName}</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-discord-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-discord-muted">Configure settings for {selectedGuild.guildName}</p>
        </div>
        <Card className="bg-discord-dark border-discord-danger">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-discord-danger">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load modmail configuration</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-discord-muted">
            Configure {botName} settings for {selectedGuild.guildName}
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-discord-primary hover:bg-discord-primary/90">
          {isSaving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Basic Configuration */}
        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <MessageSquare className="h-5 w-5 mr-2 text-discord-primary" />
              Modmail Configuration
            </CardTitle>
            <CardDescription className="text-discord-muted">Basic settings for your modmail system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="forum-channel" className="text-discord-text">
                  Forum Channel ID
                </Label>
                <Input
                  id="forum-channel"
                  value={formData.forumChannelId || ""}
                  onChange={(e) => setFormData({ ...formData, forumChannelId: e.target.value })}
                  placeholder="Enter forum channel ID"
                  className="bg-discord-darker border-discord-dark text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-role" className="text-discord-text">
                  Staff Role ID
                </Label>
                <Input
                  id="staff-role"
                  value={formData.staffRoleId || ""}
                  onChange={(e) => setFormData({ ...formData, staffRoleId: e.target.value })}
                  placeholder="Enter staff role ID"
                  className="bg-discord-darker border-discord-dark text-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guild-description" className="text-discord-text">
                Guild Description
              </Label>
              <Textarea
                id="guild-description"
                value={formData.guildDescription || ""}
                onChange={(e) => setFormData({ ...formData, guildDescription: e.target.value })}
                placeholder="Describe your server for modmail users..."
                className="bg-discord-darker border-discord-dark text-white"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Auto-Management Settings */}
        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <Clock className="h-5 w-5 mr-2 text-discord-primary" />
              Auto-Management
            </CardTitle>
            <CardDescription className="text-discord-muted">Automatic thread management and notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-discord-text">Enable Inactivity Warnings</Label>
                <p className="text-sm text-discord-muted">Send warnings for inactive threads</p>
              </div>
              <Switch checked={formData.enableInactivityWarning || false} onCheckedChange={(checked) => setFormData({ ...formData, enableInactivityWarning: checked })} />
            </div>

            {formData.enableInactivityWarning && (
              <div className="space-y-2">
                <Label htmlFor="warning-hours" className="text-discord-text">
                  Warning After (hours)
                </Label>
                <Input
                  id="warning-hours"
                  type="number"
                  value={formData.inactivityWarningHours || 24}
                  onChange={(e) => setFormData({ ...formData, inactivityWarningHours: parseInt(e.target.value) || 24 })}
                  className="bg-discord-darker border-discord-dark text-white"
                />
              </div>
            )}

            <Separator className="bg-discord-darker" />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-discord-text">Enable Auto-Close</Label>
                <p className="text-sm text-discord-muted">Automatically close inactive threads</p>
              </div>
              <Switch checked={formData.enableAutoClose || false} onCheckedChange={(checked) => setFormData({ ...formData, enableAutoClose: checked })} />
            </div>

            {formData.enableAutoClose && (
              <div className="space-y-2">
                <Label htmlFor="autoclose-hours" className="text-discord-text">
                  Auto-Close After (hours)
                </Label>
                <Input
                  id="autoclose-hours"
                  type="number"
                  value={formData.autoCloseHours || 72}
                  onChange={(e) => setFormData({ ...formData, autoCloseHours: parseInt(e.target.value) || 72 })}
                  className="bg-discord-darker border-discord-dark text-white"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Typing Indicators */}
        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <Bell className="h-5 w-5 mr-2 text-discord-primary" />
              Typing Indicators
            </CardTitle>
            <CardDescription className="text-discord-muted">Configure typing indicators for modmail conversations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-discord-text">Enable Typing Indicators</Label>
                <p className="text-sm text-discord-muted">Show when users and staff are typing in modmail</p>
              </div>
              <Switch checked={formData.typingIndicators || false} onCheckedChange={(checked) => setFormData({ ...formData, typingIndicators: checked })} />
            </div>

            {formData.typingIndicators && (
              <div className="space-y-2">
                <Label htmlFor="typing-style" className="text-discord-text">
                  Typing Indicator Style
                </Label>
                <Select
                  value={formData.typingIndicatorStyle || "native"}
                  onValueChange={(value) => setFormData({ ...formData, typingIndicatorStyle: value as "native" | "message" | "both" })}
                  className="bg-discord-darker border-discord-dark text-white">
                  <SelectItem value="native">Native Discord Typing</SelectItem>
                  <SelectItem value="message">Visual Message</SelectItem>
                  <SelectItem value="both">Both Native + Message</SelectItem>
                </Select>
                <div className="space-y-2 text-sm text-discord-muted">
                  <p>
                    <strong>Native:</strong> Shows Discord's standard typing indicator
                  </p>
                  <p>
                    <strong>Visual Message:</strong> Sends a temporary "User is typing..." message
                  </p>
                  <p>
                    <strong>Both:</strong> Uses both methods for maximum visibility
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Thread Tags */}
        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <Palette className="h-5 w-5 mr-2 text-discord-primary" />
              Thread Tags
            </CardTitle>
            <CardDescription className="text-discord-muted">Manage available tags for organizing modmail threads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {formData.tags && formData.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="border-discord-primary text-discord-primary">
                      {tag.emoji && <span className="mr-1">{tag.emoji}</span>}
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-discord-muted text-sm">No tags configured</p>
              )}
              <Button variant="outline" size="sm" className="border-discord-darker text-discord-text hover:bg-discord-darker">
                Manage Tags
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card className="bg-discord-dark border-discord-darker">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <Settings className="h-5 w-5 mr-2 text-discord-primary" />
              System Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-discord-muted">Guild ID</Label>
                <p className="text-white font-mono">{selectedGuild.guildId}</p>
              </div>
              <div>
                <Label className="text-discord-muted">Bot Status</Label>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-white">Connected</span>
                </div>
              </div>
              <div>
                <Label className="text-discord-muted">Configuration Status</Label>
                <div className="flex items-center gap-2">
                  {(config as any)?.data ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-white">Configured</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                      <span className="text-white">Needs Setup</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-discord-muted">Last Updated</Label>
                <p className="text-white">{(config as any)?.data?.updatedAt ? new Date((config as any).data.updatedAt).toLocaleDateString() : "Never"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
