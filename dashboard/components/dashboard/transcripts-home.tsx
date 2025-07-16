"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRequireGuild } from "./use-require-guild";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Eye, Calendar, Clock, User, MessageSquare, Filter, RefreshCw, FileText, AlertCircle, Loader2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";

interface ModmailThread {
  guildId: string;
  forumThreadId: string;
  forumChannelId: string;
  userId: string;
  userDisplayName: string;
  userAvatar?: string;
  lastUserActivityAt: string;
  markedResolved: boolean;
  resolvedAt?: string;
  claimedBy?: string;
  claimedAt?: string;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  closedReason?: string;
  messageCount: number;
  createdAt: string;
}

interface TranscriptsResponse {
  data: ModmailThread[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function TranscriptsHome() {
  const { selectedGuild } = useRequireGuild();
  const queryClient = useQueryClient();

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed" | "resolved">("all");
  const [sortBy, setSortBy] = useState<"lastActivity" | "created" | "resolved" | "closed">("lastActivity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingTranscript, setDownloadingTranscript] = useState<string | null>(null);

  const limit = 20;

  // Query for modmail threads
  const {
    data: threadsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["modmail-threads", selectedGuild?.guildId, currentPage, statusFilter, sortBy, sortOrder, searchQuery],
    queryFn: async (): Promise<TranscriptsResponse> => {
      if (!selectedGuild?.guildId) throw new Error("No guild selected");

      const params: any = {
        page: currentPage,
        limit,
        status: statusFilter,
        sortBy,
        sortOrder,
      };

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const response = await apiClient.getModmailThreads(selectedGuild.guildId, params);
      console.log("API Response:", response);

      // Handle different response structures
      const responseData = response as any;
      if (responseData?.data) {
        // Check if it's already in the expected format
        if (responseData.data.threads && responseData.data.pagination) {
          return {
            data: responseData.data.threads,
            pagination: responseData.data.pagination,
          } as TranscriptsResponse;
        }
        // Or if the data itself contains the expected structure
        else if (Array.isArray(responseData.data) && responseData.pagination) {
          return {
            data: responseData.data,
            pagination: responseData.pagination,
          } as TranscriptsResponse;
        }
        // Or if it's wrapped in a success response
        else if (responseData.data.data && responseData.data.pagination) {
          return {
            data: responseData.data.data,
            pagination: responseData.data.pagination,
          } as TranscriptsResponse;
        }
      }

      return responseData as TranscriptsResponse;
    },
    enabled: !!selectedGuild?.guildId,
    retry: 2,
  });

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  const handleStatusFilter = useCallback((status: "all" | "open" | "closed" | "resolved") => {
    setStatusFilter(status);
    setCurrentPage(1);
  }, []);

  const handleSort = useCallback((sortField: "lastActivity" | "created" | "resolved" | "closed", order: "asc" | "desc") => {
    setSortBy(sortField);
    setSortOrder(order);
    setCurrentPage(1);
  }, []);

  const handleDownloadTranscript = useCallback(
    async (threadId: string) => {
      if (!selectedGuild?.guildId) return;

      setDownloadingTranscript(threadId);
      try {
        const transcript = await apiClient.generateTranscript(selectedGuild.guildId, threadId, "html");
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
        alert("Failed to download transcript. Please try again.");
      } finally {
        setDownloadingTranscript(null);
      }
    },
    [selectedGuild?.guildId]
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (thread: ModmailThread) => {
    if (thread.isClosed) {
      return (
        <Badge variant="secondary" className="bg-gray-500/20 text-gray-300">
          Closed
        </Badge>
      );
    }
    if (thread.markedResolved) {
      return (
        <Badge variant="secondary" className="bg-green-500/20 text-green-300">
          Resolved
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-blue-500/20 text-blue-300">
        Open
      </Badge>
    );
  };

  const getAvatarUrl = (avatar?: string, userId?: string) => {
    if (avatar) {
      return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
    }
    return `https://cdn.discordapp.com/embed/avatars/${parseInt(userId || "0") % 5}.png`;
  };

  if (!selectedGuild) {
    return null; // The hook will handle redirection
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Transcripts</h1>
        <p className="text-discord-muted">View and manage modmail transcripts for {selectedGuild.guildName}</p>
      </div>

      {/* Search and Filters */}
      <Card className="bg-discord-dark/50 border-discord-darker">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-muted h-4 w-4" />
            <Input
              type="text"
              placeholder="Search by user name or message content..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 bg-discord-darker border-discord-darker text-white placeholder:text-discord-muted"
            />
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-discord-muted mb-2">Status</label>
              <Select value={statusFilter} onValueChange={handleStatusFilter}>
                <SelectTrigger className="bg-discord-darker border-discord-darker text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-discord-darker border-discord-darker">
                  <SelectItem value="all">All Tickets</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-discord-muted mb-2">Sort By</label>
              <Select
                value={`${sortBy}-${sortOrder}`}
                onValueChange={(value: string) => {
                  const [field, order] = value.split("-") as [typeof sortBy, typeof sortOrder];
                  handleSort(field, order);
                }}>
                <SelectTrigger className="bg-discord-darker border-discord-darker text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-discord-darker border-discord-darker">
                  <SelectItem value="lastActivity-desc">Latest Activity</SelectItem>
                  <SelectItem value="lastActivity-asc">Oldest Activity</SelectItem>
                  <SelectItem value="created-desc">Newest First</SelectItem>
                  <SelectItem value="created-asc">Oldest First</SelectItem>
                  <SelectItem value="resolved-desc">Recently Resolved</SelectItem>
                  <SelectItem value="closed-desc">Recently Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={() => refetch()} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="space-y-4">
        {/* Debug info */}
        {threadsData && !isLoading && (
          <div className="text-xs text-discord-muted p-2 bg-discord-darker/30 rounded">
            Debug:{" "}
            {JSON.stringify({
              hasData: !!threadsData.data,
              dataLength: threadsData.data?.length,
              hasPagination: !!threadsData.pagination,
              paginationKeys: threadsData.pagination ? Object.keys(threadsData.pagination) : [],
              rawKeys: Object.keys(threadsData),
            })}
          </div>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-discord-primary mx-auto mb-4" />
            <p className="text-discord-text">Loading transcripts...</p>
          </div>
        )}

        {error && (
          <Card className="bg-discord-dark/50 border-discord-danger">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-discord-danger" />
              </div>
              <p className="text-white mb-2 text-center">Failed to load transcripts</p>
              <p className="text-discord-muted mb-4 text-center">{error instanceof Error ? error.message : "Unknown error"}</p>
              <div className="flex justify-center">
                <Button onClick={() => refetch()} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {threadsData && !isLoading && threadsData.data && threadsData.pagination && (
          <>
            {/* Results Header */}
            <div className="flex items-center justify-between">
              <p className="text-discord-muted">
                Showing {threadsData.data.length} of {threadsData.pagination.total} transcripts
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={!threadsData.pagination.hasPrev}
                  className="border-discord-darker text-discord-muted hover:bg-discord-darker">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-discord-muted px-2">
                  Page {currentPage} of {threadsData.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(threadsData.pagination.totalPages, currentPage + 1))}
                  disabled={!threadsData.pagination.hasNext}
                  className="border-discord-darker text-discord-muted hover:bg-discord-darker">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Transcript List */}
            {threadsData.data.length === 0 ? (
              <Card className="bg-discord-dark/50 border-discord-darker">
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-discord-muted mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No Transcripts Found</h3>
                    <p className="text-discord-muted">{searchQuery ? `No transcripts match "${searchQuery}"` : "No transcripts available with the selected filters."}</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {threadsData.data.map((thread: ModmailThread) => (
                  <Card key={thread.forumThreadId} className="bg-discord-dark/50 border-discord-darker hover:border-discord-primary/50 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          {/* User Avatar */}
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={getAvatarUrl(thread.userAvatar, thread.userId)} alt={thread.userDisplayName} />
                            <AvatarFallback className="bg-discord-primary text-white">{thread.userDisplayName.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>

                          {/* Thread Info */}
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-white font-medium">{thread.userDisplayName}</h3>
                              {getStatusBadge(thread)}
                              <Badge variant="outline" className="border-discord-muted text-discord-muted">
                                <MessageSquare className="h-3 w-3 mr-1" />
                                {thread.messageCount} messages
                              </Badge>
                            </div>

                            <div className="flex items-center gap-4 text-sm text-discord-muted flex-wrap">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                Created: {formatDate(thread.createdAt)}
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                Last Activity: {formatDate(thread.lastUserActivityAt)}
                              </div>
                              {thread.resolvedAt && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  Resolved: {formatDate(thread.resolvedAt)}
                                </div>
                              )}
                              {thread.closedAt && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  Closed: {formatDate(thread.closedAt)}
                                </div>
                              )}
                            </div>

                            {thread.closedReason && (
                              <p className="text-sm text-discord-muted">
                                <strong>Close Reason:</strong> {thread.closedReason}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Link href={`/transcript/${selectedGuild.guildId}/${thread.forumThreadId}`}>
                            <Button variant="outline" size="sm" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadTranscript(thread.forumThreadId)}
                            disabled={downloadingTranscript === thread.forumThreadId}
                            className="border-discord-darker text-discord-muted hover:bg-discord-darker">
                            {downloadingTranscript === thread.forumThreadId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                            Download
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Pagination */}
            {threadsData.pagination && threadsData.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button variant="outline" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="border-discord-darker text-discord-muted hover:bg-discord-darker">
                  First
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={!threadsData.pagination.hasPrev}
                  className="border-discord-darker text-discord-muted hover:bg-discord-darker">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-discord-muted px-4">
                  Page {currentPage} of {threadsData.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(Math.min(threadsData.pagination.totalPages, currentPage + 1))}
                  disabled={!threadsData.pagination.hasNext}
                  className="border-discord-darker text-discord-muted hover:bg-discord-darker">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(threadsData.pagination.totalPages)}
                  disabled={currentPage === threadsData.pagination.totalPages}
                  className="border-discord-darker text-discord-muted hover:bg-discord-darker">
                  Last
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
