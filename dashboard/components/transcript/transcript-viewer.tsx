"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, MessageSquare, Download, Calendar, Clock, User, AlertCircle, Loader2, Copy, ExternalLink, Shield, Ban, CheckCircle, XCircle, UserCheck, Activity } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatTranscriptDate, getStaticAvatarUrl, getDisplayContent } from "@/lib/transcript-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserProp {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

interface TranscriptViewerProps {
  guildId: string;
  threadId: string;
  user: UserProp;
}

interface ModmailMessage {
  messageId: string;
  type: "user" | "staff";
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  attachments?: any[];
  createdAt: string;
  isEdited?: boolean;
  editedContent?: string;
  editedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

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
  messages?: ModmailMessage[];
  guildName?: string;
}

export function TranscriptViewer({ guildId, threadId, user }: TranscriptViewerProps) {
  const router = useRouter();
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadingTranscript, setDownloadingTranscript] = useState(false);

  // Validate user permissions for this transcript
  const {
    data: permissionData,
    isLoading: isCheckingPermissions,
    error: permissionError,
  } = useQuery({
    queryKey: ["transcript-permissions", guildId, threadId, user.id],
    queryFn: async () => {
      // First, get the thread to check if user is the ticket owner
      const threadResponse = await apiClient.getModmailThread(guildId, threadId, false);
      const thread = (threadResponse as any)?.data;

      if (!thread) {
        throw new Error("Transcript not found");
      }

      // Check if user is the ticket owner
      if (thread.userId === user.id) {
        return { authorized: true, reason: "ticket_owner" };
      }

      // Check if user has staff role in this guild
      const userValidation = await apiClient.validateUser(user.id);
      const guilds = (userValidation as any)?.data?.guilds || [];
      const hasStaffRole = guilds.some((guild: any) => guild.guildId === guildId && guild.hasStaffRole);

      if (hasStaffRole) {
        return { authorized: true, reason: "staff_role" };
      }

      return { authorized: false, reason: "no_permission" };
    },
    retry: 1,
  });

  // Get the modmail thread with messages (only if authorized)
  const {
    data: threadData,
    isLoading: isLoadingThread,
    error: threadError,
    refetch,
  } = useQuery({
    queryKey: ["modmail-thread", guildId, threadId],
    queryFn: async () => {
      const response = await apiClient.getModmailThread(guildId, threadId, true);
      return response;
    },
    enabled: permissionData?.authorized === true,
    retry: 2,
  });

  const isLoading = isCheckingPermissions || isLoadingThread;
  const error = permissionError || threadError;

  const handleBack = useCallback(() => {
    router.push("/my-tickets");
  }, [router]);

  const handleDownloadTranscript = useCallback(async () => {
    setDownloadingTranscript(true);
    try {
      const transcript = await apiClient.generateTranscript(guildId, threadId, "html");
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
      setDownloadingTranscript(false);
    }
  }, [guildId, threadId]);

  const handleCopyTranscript = useCallback(async () => {
    try {
      const thread = (threadData as any)?.data as ModmailThread;
      if (!thread?.messages) return;

      const textTranscript = thread.messages
        .map((msg) => {
          const timestamp = formatTranscriptDate(msg.createdAt);
          const author = msg.type === "user" ? thread.userDisplayName : msg.authorName;
          const { displayContent } = getDisplayContent(msg);
          return `[${timestamp}] ${author}: ${displayContent}`;
        })
        .join("\n");

      await navigator.clipboard.writeText(textTranscript);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error("Failed to copy transcript:", error);
    }
  }, [threadData]);

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

  const getMessageTypeIcon = (type: "user" | "staff") => {
    if (type === "staff") {
      return <Shield className="h-4 w-4 text-discord-primary" />;
    }
    return <User className="h-4 w-4 text-discord-muted" />;
  };

  // Check for unauthorized access
  if (permissionData && !permissionData.authorized) {
    return (
      <div className="max-w-5xl mx-auto px-2 sm:px-0">
        <div className="text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center mb-6">
            <Shield className="h-8 sm:h-12 w-8 sm:w-12 text-discord-danger mb-2 sm:mb-0 sm:mr-4" />
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Access Denied</h1>
          </div>
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center mb-4">
                <Ban className="h-8 sm:h-12 w-8 sm:w-12 text-discord-danger" />
              </div>
              <p className="text-white mb-2">You don't have permission to view this transcript</p>
              <p className="text-discord-muted mb-4 text-sm sm:text-base">You can only view transcripts for tickets you created or if you have staff permissions in this server.</p>
              <Button onClick={handleBack} variant="outline" className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Tickets
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-2 sm:px-0">
        <div className="text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center mb-6">
            <FileText className="h-8 sm:h-12 w-8 sm:w-12 text-discord-primary mb-2 sm:mb-0 sm:mr-4" />
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Loading Transcript</h1>
          </div>
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 sm:h-8 w-6 sm:w-8 animate-spin text-discord-primary mr-3" />
            <p className="text-discord-text">Loading conversation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-2 sm:px-0">
        <div className="text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center mb-6">
            <FileText className="h-8 sm:h-12 w-8 sm:w-12 text-discord-primary mb-2 sm:mb-0 sm:mr-4" />
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Transcript Error</h1>
          </div>
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-8 sm:h-12 w-8 sm:w-12 text-discord-danger" />
              </div>
              <p className="text-white mb-2">Failed to load transcript</p>
              <p className="text-discord-muted mb-4 text-sm sm:text-base">{error instanceof Error ? error.message : "There was an error loading the transcript. Please try again later."}</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button onClick={() => refetch()} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white w-full sm:w-auto">
                  Try Again
                </Button>
                <Button onClick={handleBack} variant="outline" className="w-full sm:w-auto">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to My Tickets
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const thread = (threadData as any)?.data as ModmailThread;

  if (!thread) {
    return (
      <div className="max-w-5xl mx-auto px-2 sm:px-0">
        <div className="text-center">
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <p className="text-white mb-4">Transcript not found</p>
              <Button onClick={handleBack} variant="outline" className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Tickets
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button onClick={handleBack} variant="outline" size="sm" className="w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to My Tickets
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="h-5 sm:h-6 w-5 sm:w-6 text-discord-primary" />
            <h1 className="text-xl sm:text-2xl font-bold text-white">Conversation Transcript</h1>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <Button onClick={handleCopyTranscript} variant="outline" size="sm" className="border-discord-darker text-discord-muted hover:bg-discord-darker w-full sm:w-auto">
            {copySuccess ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2 text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy Text
              </>
            )}
          </Button>
          <Button
            onClick={handleDownloadTranscript}
            variant="outline"
            size="sm"
            disabled={downloadingTranscript}
            className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white w-full sm:w-auto">
            {downloadingTranscript ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download HTML
          </Button>
        </div>
      </div>

      {/* Thread Information */}
      <Card className="bg-discord-dark/50 border-discord-darker">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Thread Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-10 sm:h-12 w-10 sm:w-12 flex-shrink-0">
              <AvatarImage src={getAvatarUrl(thread.userAvatar, thread.userId)} alt={thread.userDisplayName} />
              <AvatarFallback className="bg-discord-primary text-white">{thread.userDisplayName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-semibold text-white truncate">{thread.userDisplayName}</h2>
                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(thread)}
                  <Badge variant="outline" className="border-discord-muted text-discord-muted text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {thread.messageCount} messages
                  </Badge>
                  <Badge variant="outline" className="border-discord-muted text-discord-muted text-xs">
                    ID: {thread.userId}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                <div className="flex items-center gap-2 text-discord-muted">
                  <Calendar className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                  <span className="truncate">Created: {formatDate(thread.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-discord-muted">
                  <Activity className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                  <span className="truncate">Last Activity: {formatDate(thread.lastUserActivityAt)}</span>
                </div>
                {thread.claimedBy && (
                  <div className="flex items-center gap-2 text-discord-muted">
                    <UserCheck className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                    <span className="truncate">Claimed by staff</span>
                  </div>
                )}
                {thread.resolvedAt && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                    <span className="truncate">Resolved: {formatDate(thread.resolvedAt)}</span>
                  </div>
                )}
                {thread.closedAt && (
                  <div className="flex items-center gap-2 text-red-400">
                    <XCircle className="h-3 sm:h-4 w-3 sm:w-4 flex-shrink-0" />
                    <span className="truncate">Closed: {formatDate(thread.closedAt)}</span>
                  </div>
                )}
              </div>

              {thread.closedReason && (
                <div className="bg-discord-darker/50 rounded-lg p-3">
                  <p className="text-xs sm:text-sm text-discord-muted">
                    <strong>Close Reason:</strong> {thread.closedReason}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages - Using the same styling as staff version */}
      {thread.messages && thread.messages.length > 0 ? (
        <Card className="bg-discord-dark/50 border-discord-darker">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversation ({thread.messages.length} messages)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {thread.messages.map((message, index) => {
              const { displayContent } = getDisplayContent(message);
              const isStaff = message.type === "staff";
              const hasAttachments = message.attachments && message.attachments.length > 0;

              return (
                <div key={message.messageId} className={`flex gap-3 ${isStaff ? "bg-discord-primary/5 rounded-lg p-3" : ""}`}>
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage
                      src={isStaff ? getStaticAvatarUrl(message.authorAvatar) : getAvatarUrl(thread.userAvatar, thread.userId)}
                      alt={isStaff ? message.authorName : thread.userDisplayName}
                    />
                    <AvatarFallback className={`text-white text-sm ${isStaff ? "bg-discord-primary" : "bg-discord-secondary"}`}>
                      {(isStaff ? message.authorName : thread.userDisplayName).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {getMessageTypeIcon(message.type)}
                        <span className={`font-medium ${isStaff ? "text-discord-primary" : "text-white"}`}>{isStaff ? message.authorName : thread.userDisplayName}</span>
                        {isStaff && (
                          <Badge variant="secondary" className="bg-discord-primary/20 text-discord-primary text-xs">
                            Staff
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-discord-muted">{formatDate(message.createdAt)}</span>
                      {message.isEdited && (
                        <Badge variant="outline" className="border-discord-muted text-discord-muted text-xs">
                          Edited
                        </Badge>
                      )}
                      {message.isDeleted && (
                        <Badge variant="secondary" className="bg-red-500/20 text-red-300 text-xs">
                          Deleted
                        </Badge>
                      )}
                    </div>

                    <div className="text-discord-text">
                      <p className="whitespace-pre-wrap break-words">{displayContent}</p>

                      {hasAttachments && (
                        <div className="mt-2 space-y-1">
                          {message.attachments!.map((attachment: any, attIndex: number) => (
                            <div key={attIndex} className="text-sm text-discord-muted bg-discord-darker/50 rounded p-2">
                              📎 Attachment: {attachment.name || "Unknown file"}
                              {attachment.url && (
                                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-discord-primary hover:underline">
                                  <ExternalLink className="h-3 w-3 inline" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {message.isEdited && message.editedContent && (
                        <div className="mt-2 text-sm text-discord-muted bg-discord-darker/50 rounded p-2">
                          <strong>Original:</strong> {message.editedContent}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-discord-dark/50 border-discord-darker">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <MessageSquare className="h-8 sm:h-12 w-8 sm:w-12 text-discord-muted mx-auto mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">No Messages</h3>
              <p className="text-discord-muted text-sm sm:text-base">This thread doesn't contain any messages yet.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
