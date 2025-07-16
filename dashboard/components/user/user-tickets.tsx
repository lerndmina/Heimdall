"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, FileText, MessageSquare, Search, Download, Calendar, Clock, User, AlertCircle, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";

interface UserProp {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

interface UserTicketsProps {
  user: UserProp;
}

interface ModmailThread {
  forumThreadId: string;
  userId: string;
  userDisplayName: string;
  guildId: string;
  guildName?: string;
  createdAt: string;
  lastUserActivityAt: string;
  isClosed: boolean;
  closedAt?: string;
  messageCount: number;
  markedResolved: boolean;
}

interface TicketsResponse {
  tickets: ModmailThread[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function UserTickets({ user }: UserTicketsProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGuild, setSelectedGuild] = useState<string>("all");

  // Get user's modmail threads across all guilds
  const {
    data: ticketsResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user-tickets", user.id, searchQuery, selectedGuild],
    queryFn: async () => {
      return await apiClient.getUserTickets(user.id, {
        search: searchQuery || undefined,
        guildId: selectedGuild !== "all" ? selectedGuild : undefined,
        limit: 50,
      });
    },
    retry: 2,
  });

  // Extract unique guilds from the tickets
  const ticketsData = ticketsResponse as any;
  const guilds =
    ticketsData?.data?.tickets?.reduce((acc: { guildId: string; guildName?: string }[], ticket: ModmailThread) => {
      if (!acc.find((g) => g.guildId === ticket.guildId)) {
        acc.push({
          guildId: ticket.guildId,
          guildName: ticket.guildName || `Guild ${ticket.guildId}`,
        });
      }
      return acc;
    }, []) || [];

  const handleBack = () => {
    router.push("/");
  };

  const handleViewTranscript = (threadId: string, guildId: string) => {
    if (!threadId || !guildId || threadId === "undefined" || guildId === "undefined") {
      console.error("Invalid thread or guild ID for viewing:", { threadId, guildId });
      alert("Error: Invalid thread or guild ID. Please try refreshing the page.");
      return;
    }
    router.push(`/transcript/${guildId}/${threadId}`);
  };

  const handleDownloadTranscript = async (threadId: string, guildId: string) => {
    try {
      // Validate inputs
      if (!threadId || !guildId || threadId === "undefined" || guildId === "undefined") {
        console.error("Invalid thread or guild ID:", { threadId, guildId });
        alert("Error: Invalid thread or guild ID. Please try refreshing the page.");
        return;
      }

      console.log("Downloading transcript for:", { threadId, guildId });
      const transcript = await apiClient.generateTranscript(guildId, threadId, "html");

      // Create download
      const blob = new Blob([transcript], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcript-${threadId}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Failed to download transcript:", error);
      const errorMessage = error?.message || "Unknown error occurred";
      alert(`Failed to download transcript: ${errorMessage}`);
    }
  };

  const filteredThreads =
    ticketsData?.data?.tickets?.filter((thread: ModmailThread) => {
      const matchesSearch = !searchQuery || thread.userDisplayName.toLowerCase().includes(searchQuery.toLowerCase()) || thread.guildName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesGuild = selectedGuild === "all" || thread.guildId === selectedGuild;

      return matchesSearch && matchesGuild;
    }) || [];

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-2 sm:px-0">
        <div className="text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center mb-6">
            <FileText className="h-8 sm:h-12 w-8 sm:w-12 text-discord-primary mb-2 sm:mb-0 sm:mr-4" />
            <h1 className="text-2xl sm:text-4xl font-bold text-white">My Tickets</h1>
          </div>
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 sm:h-8 w-6 sm:w-8 animate-spin text-discord-primary mr-3" />
            <p className="text-discord-text">Loading your tickets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-2 sm:px-0">
        <div className="text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center mb-6">
            <FileText className="h-8 sm:h-12 w-8 sm:w-12 text-discord-primary mb-2 sm:mb-0 sm:mr-4" />
            <h1 className="text-2xl sm:text-4xl font-bold text-white">My Tickets</h1>
          </div>
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-8 sm:h-12 w-8 sm:w-12 text-discord-danger" />
              </div>
              <p className="text-white mb-2">Failed to load your tickets</p>
              <p className="text-discord-muted mb-4 text-sm sm:text-base">There was an error connecting to the API. Please try again later.</p>
              <Button onClick={handleBack} variant="outline" className="w-full sm:w-auto">
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
    <div className="max-w-6xl mx-auto px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-4">
        <div>
          <div className="flex items-center mb-4">
            <FileText className="h-6 sm:h-8 w-6 sm:w-8 text-discord-primary mr-3" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">My Tickets</h1>
          </div>
          <p className="text-discord-text text-sm sm:text-base">View and download transcripts of your modmail conversations</p>
        </div>
        <Button onClick={handleBack} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white w-full sm:w-auto">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
      </div>

      {/* Search and Filters */}
      <Card className="bg-discord-dark border-discord-darker mb-4 sm:mb-6">
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-discord-muted" />
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-10 bg-discord-darker border-discord-dark text-white placeholder-discord-muted"
              />
            </div>
            <select value={selectedGuild} onChange={(e) => setSelectedGuild(e.target.value)} className="w-full px-3 py-2 bg-discord-darker border border-discord-dark rounded-md text-white text-sm">
              <option value="all">All Servers</option>
              {guilds?.map((guild: { guildId: string; guildName?: string }, index: number) => (
                <option key={guild.guildId || `guild-${index}`} value={guild.guildId}>
                  {guild.guildName}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      {filteredThreads.length === 0 ? (
        <Card className="bg-discord-dark border-discord-darker">
          <CardContent className="pt-6">
            <div className="text-center px-4 py-8">
              <MessageSquare className="h-12 sm:h-16 w-12 sm:w-16 text-discord-muted mx-auto mb-4" />
              <h3 className="text-lg sm:text-xl font-medium text-white mb-2">No Tickets Found</h3>
              <p className="text-discord-muted mb-6 text-sm sm:text-base">{searchQuery ? "No tickets match your search criteria." : "You don't have any modmail tickets yet."}</p>
              {searchQuery && (
                <Button onClick={() => setSearchQuery("")} variant="outline" className="w-full sm:w-auto">
                  Clear Search
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {filteredThreads.map((thread: ModmailThread) => (
            <Card key={`${thread.guildId}-${thread.forumThreadId}`} className="bg-discord-dark border-discord-darker hover:border-discord-primary/50 transition-colors">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex flex-col space-y-4">
                  {/* Header with title and badges */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                        <h3 className="text-base sm:text-lg font-medium text-white truncate">{thread.guildName || "Unknown Server"}</h3>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant={thread.isClosed ? "secondary" : "default"}
                            className={thread.isClosed ? "bg-discord-danger/20 text-discord-danger text-xs" : "bg-discord-success/20 text-discord-success text-xs"}>
                            {thread.isClosed ? "Closed" : "Open"}
                          </Badge>
                          {thread.markedResolved && (
                            <Badge variant="secondary" className="bg-discord-warning/20 text-discord-warning text-xs">
                              Resolved
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Info grid - stack on mobile */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm text-discord-text">
                        <div className="flex items-center">
                          <Calendar className="h-3 sm:h-4 w-3 sm:w-4 text-discord-muted mr-2 flex-shrink-0" />
                          <span className="truncate">Created {new Date(thread.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-3 sm:h-4 w-3 sm:w-4 text-discord-muted mr-2 flex-shrink-0" />
                          <span className="truncate">Last activity {new Date(thread.lastUserActivityAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center">
                          <MessageSquare className="h-3 sm:h-4 w-3 sm:w-4 text-discord-muted mr-2 flex-shrink-0" />
                          <span>{thread.messageCount} messages</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons - full width on mobile */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 sm:ml-4 sm:flex-shrink-0">
                      <Button
                        onClick={() => handleViewTranscript(thread.forumThreadId, thread.guildId)}
                        size="sm"
                        className="bg-discord-primary hover:bg-discord-secondary w-full sm:w-auto text-xs sm:text-sm">
                        <FileText className="h-3 sm:h-4 w-3 sm:w-4 mr-1 sm:mr-2" />
                        View
                      </Button>
                      <Button
                        onClick={() => handleDownloadTranscript(thread.forumThreadId, thread.guildId)}
                        size="sm"
                        variant="outline"
                        className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white w-full sm:w-auto text-xs sm:text-sm">
                        <Download className="h-3 sm:h-4 w-3 sm:w-4 mr-1 sm:mr-2" />
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
