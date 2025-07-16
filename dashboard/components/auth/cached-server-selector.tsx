"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, ArrowRight, Shield, Users, MessageSquare, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useServerCache } from "../dashboard/server-cache-provider";
import { useRole } from "./role-provider";
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

export function CachedServerSelector({ user }: ServerSelectorProps) {
  const router = useRouter();
  const { clearRole } = useRole();
  const { servers, isLoading, error, refreshServers, initializeCache, checkServerPermissions } = useServerCache();
  const botName = useBotName();
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  // Initialize cache when component mounts
  useEffect(() => {
    console.log(`CachedServerSelector: Initializing cache for user ${user.id}`);
    initializeCache(user.id);
  }, [user.id]); // Remove initializeCache from dependencies to prevent infinite re-renders

  const handleBack = useCallback(() => {
    clearRole();
    router.push("/");
  }, [clearRole, router]);

  const handleSelectServer = useCallback(
    async (guildId: string) => {
      setIsNavigating(true);

      try {
        // Check permissions before navigating
        const hasPermission = await checkServerPermissions(guildId);

        if (!hasPermission) {
          alert("You don't have permission to access this server's modmail.");
          setIsNavigating(false);
          return;
        }

        // Navigate to dashboard
        sessionStorage.setItem("heimdall-selected-guild", guildId);
        router.push("/dashboard");
      } catch (error) {
        console.error("Failed to verify server permissions:", error);
        alert("Failed to verify server permissions. Please try again.");
        setIsNavigating(false);
      }
    },
    [checkServerPermissions, router]
  );

  const getServerIcon = useCallback((server: any) => {
    if (server.icon) {
      return `https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`;
    }
    return null;
  }, []);

  const getServerInitials = useCallback((name: string) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <Shield className="h-12 w-12 text-discord-primary mr-4" />
            <h1 className="text-4xl font-bold text-white">Select Server</h1>
          </div>
        </div>

        <Card className="bg-discord-dark/50 backdrop-blur border-discord-danger">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center mb-4">
              <AlertCircle className="h-12 w-12 text-discord-danger" />
            </div>
            <p className="text-white mb-2 text-center">Failed to load servers</p>
            <p className="text-discord-muted mb-4 text-center">{error}</p>
            <div className="flex gap-4 justify-center">
              <Button onClick={refreshServers} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-6">
          <Shield className="h-12 w-12 text-discord-primary mr-4" />
          <h1 className="text-4xl font-bold text-white">Select Server</h1>
        </div>
        <p className="text-xl text-discord-text mb-4">Choose a Discord server to manage</p>
        <Button onClick={handleBack} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Role Selection
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-discord-primary mx-auto mb-4" />
          <p className="text-discord-text">Loading your servers...</p>
        </div>
      )}

      {/* Server Grid */}
      {!isLoading && servers.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {servers.map((server) => (
            <Card
              key={server.id}
              className={`bg-discord-dark/50 backdrop-blur border-discord-darker hover:border-discord-primary/50 transition-all cursor-pointer group ${
                selectedGuild === server.id ? "border-discord-primary bg-discord-primary/10" : ""
              }`}
              onClick={() => setSelectedGuild(server.id)}>
              <CardHeader className="text-center pb-4">
                <div className="flex items-center justify-center mb-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={getServerIcon(server) || undefined} alt={server.name} />
                    <AvatarFallback className="bg-discord-primary text-white text-xl">{getServerInitials(server.name)}</AvatarFallback>
                  </Avatar>
                </div>
                <CardTitle className="text-white text-lg">{server.name}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-center gap-2 text-sm text-discord-muted">
                    <MessageSquare className="h-4 w-4" />
                    <span>Modmail Enabled</span>
                  </div>
                </div>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectServer(server.id);
                  }}
                  disabled={isNavigating}
                  className="w-full bg-discord-primary hover:bg-discord-secondary disabled:opacity-50">
                  {isNavigating && selectedGuild === server.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Select Server
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* No Servers */}
      {!isLoading && servers.length === 0 && (
        <div className="text-center py-12">
          <div className="flex items-center justify-center mb-6">
            <AlertCircle className="h-12 w-12 text-discord-muted" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Servers Available</h3>
          <p className="text-discord-muted mb-6 max-w-md mx-auto">You don't have staff permissions on any servers with {botName} modmail enabled.</p>
          <div className="flex gap-4 justify-center">
            <Button onClick={refreshServers} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={handleBack} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
