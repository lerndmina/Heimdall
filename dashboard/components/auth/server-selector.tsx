"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, ArrowRight, Shield, Users, MessageSquare, AlertCircle, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { discordApi } from "@/lib/discord-api";
import { useBotName } from "@/hooks/use-bot-info";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

interface ServerSelectorProps {
  user: User;
}

interface Guild {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  hasStaffRole: boolean;
  memberCount?: number;
  modmailThreads?: number;
}

export function ServerSelector({ user }: ServerSelectorProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const botName = useBotName();
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);

  // Get user's Discord guilds
  const {
    data: discordGuilds,
    isLoading: discordLoading,
    error: discordError,
  } = useQuery({
    queryKey: ["discord-guilds", session?.accessToken],
    queryFn: async () => {
      if (!session?.accessToken) {
        throw new Error("No access token available");
      }
      return discordApi.getUserGuilds(session.accessToken);
    },
    enabled: !!session?.accessToken,
    retry: 2,
  });

  // Get bot validation for these guilds - use the user prop which comes from server-side session
  const {
    data: botValidation,
    isLoading: botLoading,
    error: botError,
  } = useQuery({
    queryKey: ["bot-validation", user.id],
    queryFn: () => apiClient.validateUser(user.id),
    enabled: !!user.id,
    retry: 2,
  });

  const isLoading = discordLoading || botLoading;
  const error = discordError || botError;

  // Filter guilds where user has permissions and bot has staff roles
  const staffGuilds =
    discordGuilds
      ?.filter((discordGuild) => {
        // Check if user has admin/manage permissions
        const hasPermissions = discordApi.hasManageGuildPermissions(discordGuild);

        // Check if this guild is validated by the bot
        const botGuild = (botValidation as any)?.data?.guilds?.find((bg: Guild) => bg.guildId === discordGuild.id);

        // Only show guilds where user has manage permissions AND has staff role in the bot
        return hasPermissions && botGuild?.hasStaffRole === true;
      })
      .map((discordGuild) => {
        const botGuild = (botValidation as any)?.data?.guilds?.find((bg: Guild) => bg.guildId === discordGuild.id);

        return {
          guildId: discordGuild.id,
          guildName: discordGuild.name,
          guildIcon: discordGuild.icon,
          hasStaffRole: botGuild?.hasStaffRole || false,
          memberCount: undefined,
          modmailThreads: undefined,
          // Add debug info
          botConfigured: !!botGuild,
          userIsOwner: discordGuild.owner,
          permissions: discordGuild.permissions,
        };
      }) || [];

  // Debug logging only when data changes (not on every render)
  useEffect(() => {
    if (!isLoading && discordGuilds && botValidation) {
      const totalDiscordGuilds = discordGuilds.length;
      const guildsWithPermissions = discordGuilds.filter((guild) => discordApi.hasManageGuildPermissions(guild)).length;

      console.log(`Server Summary: ${totalDiscordGuilds} total Discord servers, ${guildsWithPermissions} with manage permissions`);
      console.log(`Found ${staffGuilds.length} authorized servers:`);
      staffGuilds.forEach((guild: Guild) => {
        console.log(`- ${guild.guildName} (${guild.guildId}) - Staff: ${guild.hasStaffRole}`);
      });
    }
  }, [discordGuilds, botValidation, isLoading, staffGuilds]);

  const handleGuildSelect = (guildId: string) => {
    console.log(`Selecting guild: ${guildId}`);
    setSelectedGuild(guildId);

    // Store the selected guild ID in sessionStorage
    // The GuildProvider will pick this up when the dashboard loads
    sessionStorage.setItem("heimdall-selected-guild", guildId);
    console.log(`Stored guild ${guildId} in sessionStorage`);

    // Navigate to the dashboard
    router.push("/dashboard");
  };

  const handleBack = () => {
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <Shield className="h-12 w-12 text-discord-primary mr-4" />
            <h1 className="text-4xl font-bold text-white">Select Server</h1>
          </div>
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-discord-primary mr-3" />
            <p className="text-discord-text">Loading your servers...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <Shield className="h-12 w-12 text-discord-primary mr-4" />
            <h1 className="text-4xl font-bold text-white">Select Server</h1>
          </div>
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-discord-danger" />
              </div>
              <p className="text-white mb-2">Failed to load server information</p>
              <p className="text-discord-muted mb-4">Please make sure you have the proper API key configured.</p>
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-6">
          <Shield className="h-12 w-12 text-discord-primary mr-4" />
          <h1 className="text-4xl font-bold text-white">Select Server</h1>
        </div>
        <p className="text-xl text-discord-text mb-4">Choose which Discord server you'd like to manage</p>
        <Button onClick={handleBack} variant="ghost" className="text-discord-text hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
      </div>

      {/* Server Grid */}
      {staffGuilds.length === 0 ? (
        <Card className="bg-discord-dark border-discord-darker">
          <CardContent className="pt-6">
            <div className="text-center">
              <Users className="h-16 w-16 text-discord-muted mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">No Staff Servers Found</h3>
              <p className="text-discord-muted mb-6">You don't appear to have staff permissions on any servers with {botName} configured.</p>
              <div className="space-y-2 text-sm text-discord-text">
                <p>• Make sure you have the required staff role on your Discord server</p>
                <p>• Ensure {botName} is properly configured on your server</p>
                <p>• Contact your server administrator if you believe this is an error</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {staffGuilds.map((guild: Guild) => (
            <Card
              key={guild.guildId}
              className="bg-discord-dark/50 backdrop-blur border-discord-darker hover:border-discord-primary/50 transition-all cursor-pointer group"
              onClick={() => handleGuildSelect(guild.guildId)}>
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={guild.guildIcon ? `https://cdn.discordapp.com/icons/${guild.guildId}/${guild.guildIcon}.png` : undefined} alt={guild.guildName} />
                    <AvatarFallback className="bg-discord-primary text-white">{guild.guildName[0]?.toUpperCase() || "S"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-white text-lg truncate">{guild.guildName}</CardTitle>
                    <div className="flex items-center mt-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-discord-success/20 text-discord-success">
                        <Shield className="h-3 w-3 mr-1" />
                        Staff
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="space-y-3">
                  {guild.memberCount && (
                    <div className="flex items-center text-discord-text text-sm">
                      <Users className="h-4 w-4 text-discord-muted mr-2" />
                      <span>{guild.memberCount.toLocaleString()} members</span>
                    </div>
                  )}

                  {guild.modmailThreads !== undefined && (
                    <div className="flex items-center text-discord-text text-sm">
                      <MessageSquare className="h-4 w-4 text-discord-muted mr-2" />
                      <span>{guild.modmailThreads} open tickets</span>
                    </div>
                  )}

                  <Button
                    className="w-full bg-discord-primary hover:bg-discord-secondary text-white mt-4 group-hover:bg-discord-secondary transition-colors"
                    disabled={selectedGuild === guild.guildId}>
                    {selectedGuild === guild.guildId ? (
                      "Loading..."
                    ) : (
                      <>
                        Manage Server
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
