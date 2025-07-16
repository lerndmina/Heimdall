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

export function UserTickets({ user }: UserTicketsProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGuild, setSelectedGuild] = useState<string>("all");

  // Get user's modmail threads across all guilds
  const {
    data: userThreads,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user-threads", user.id, searchQuery],
    queryFn: async () => {
      // This would need to be implemented in the API to search across all guilds
      // For now, we'll use a placeholder
      return {
        threads: [] as ModmailThread[],
        guilds: [] as { guildId: string; guildName: string }[],
      };
    },
    retry: 2,
  });

  const handleBack = () => {
    router.push("/");
  };

  const handleViewTranscript = (threadId: string, guildId: string) => {
    router.push(`/transcript/${guildId}/${threadId}`);
  };

  const handleDownloadTranscript = async (threadId: string, guildId: string) => {
    try {
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
    } catch (error) {
      console.error("Failed to download transcript:", error);
    }
  };

  const filteredThreads =
    userThreads?.threads?.filter((thread: ModmailThread) => {
      const matchesSearch = !searchQuery || thread.userDisplayName.toLowerCase().includes(searchQuery.toLowerCase()) || thread.guildName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesGuild = selectedGuild === "all" || thread.guildId === selectedGuild;

      return matchesSearch && matchesGuild;
    }) || [];

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <FileText className="h-12 w-12 text-discord-primary mr-4" />
            <h1 className="text-4xl font-bold text-white">My Tickets</h1>
          </div>
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-discord-primary mr-3" />
            <p className="text-discord-text">Loading your tickets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <FileText className="h-12 w-12 text-discord-primary mr-4" />
            <h1 className="text-4xl font-bold text-white">My Tickets</h1>
          </div>
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-discord-danger" />
              </div>
              <p className="text-white mb-2">Failed to load your tickets</p>
              <p className="text-discord-muted mb-4">There was an error connecting to the API. Please try again later.</p>
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center mb-4">
            <FileText className="h-8 w-8 text-discord-primary mr-3" />
            <h1 className="text-3xl font-bold text-white">My Tickets</h1>
          </div>
          <p className="text-discord-text">View and download transcripts of your modmail conversations</p>
        </div>
        <Button onClick={handleBack} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
      </div>

      {/* Search and Filters */}
      <Card className="bg-discord-dark border-discord-darker mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-discord-muted" />
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-10 bg-discord-darker border-discord-dark text-white placeholder-discord-muted"
              />
            </div>
            <select value={selectedGuild} onChange={(e) => setSelectedGuild(e.target.value)} className="px-3 py-2 bg-discord-darker border border-discord-dark rounded-md text-white">
              <option value="all">All Servers</option>
              {userThreads?.guilds?.map((guild) => (
                <option key={guild.guildId} value={guild.guildId}>
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
            <div className="text-center">
              <MessageSquare className="h-16 w-16 text-discord-muted mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">No Tickets Found</h3>
              <p className="text-discord-muted mb-6">{searchQuery ? "No tickets match your search criteria." : "You don't have any modmail tickets yet."}</p>
              {searchQuery && (
                <Button onClick={() => setSearchQuery("")} variant="outline">
                  Clear Search
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredThreads.map((thread: ModmailThread) => (
            <Card key={`${thread.guildId}-${thread.forumThreadId}`} className="bg-discord-dark border-discord-darker hover:border-discord-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-medium text-white">{thread.guildName || "Unknown Server"}</h3>
                      <Badge
                        variant={thread.isClosed ? "secondary" : "default"}
                        className={thread.isClosed ? "bg-discord-danger/20 text-discord-danger" : "bg-discord-success/20 text-discord-success"}>
                        {thread.isClosed ? "Closed" : "Open"}
                      </Badge>
                      {thread.markedResolved && (
                        <Badge variant="secondary" className="bg-discord-warning/20 text-discord-warning">
                          Resolved
                        </Badge>
                      )}
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 text-sm text-discord-text">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 text-discord-muted mr-2" />
                        <span>Created {new Date(thread.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 text-discord-muted mr-2" />
                        <span>Last activity {new Date(thread.lastUserActivityAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center">
                        <MessageSquare className="h-4 w-4 text-discord-muted mr-2" />
                        <span>{thread.messageCount} messages</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Button onClick={() => handleViewTranscript(thread.forumThreadId, thread.guildId)} size="sm" className="bg-discord-primary hover:bg-discord-secondary">
                      <FileText className="h-4 w-4 mr-2" />
                      View
                    </Button>
                    <Button
                      onClick={() => handleDownloadTranscript(thread.forumThreadId, thread.guildId)}
                      size="sm"
                      variant="outline"
                      className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
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
