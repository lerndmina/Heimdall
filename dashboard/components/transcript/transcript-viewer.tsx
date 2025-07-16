"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, MessageSquare, Download, Calendar, Clock, User, AlertCircle, Loader2, Copy, ExternalLink } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatTranscriptDate, getStaticAvatarUrl, getDisplayContent } from "@/lib/transcript-utils";

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

  // Get the modmail thread with messages
  const {
    data: threadData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["modmail-thread", guildId, threadId],
    queryFn: async () => {
      return await apiClient.getModmailThread(guildId, threadId, true);
    },
    retry: 2,
  });

  const handleBack = () => {
    router.push("/my-tickets");
  };

  const handleDownloadTranscript = async () => {
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
    }
  };

  const handleCopyTranscript = async () => {
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
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <FileText className="h-12 w-12 text-discord-primary mr-4" />
            <h1 className="text-4xl font-bold text-white">Loading Transcript</h1>
          </div>
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-discord-primary mr-3" />
            <p className="text-discord-text">Loading conversation...</p>
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
            <FileText className="h-12 w-12 text-discord-primary mr-4" />
            <h1 className="text-4xl font-bold text-white">Transcript Error</h1>
          </div>
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-discord-danger" />
              </div>
              <p className="text-white mb-2">Failed to load transcript</p>
              <p className="text-discord-muted mb-4">{error instanceof Error ? error.message : "There was an error loading the transcript. Please try again later."}</p>
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Tickets
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const thread = (threadData as any)?.data as ModmailThread;

  // Check if user has access to this thread
  if (thread && thread.userId !== user.id) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center">
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-discord-danger" />
              </div>
              <p className="text-white mb-2">Access Denied</p>
              <p className="text-discord-muted mb-4">You don't have permission to view this transcript.</p>
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Tickets
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center">
          <Card className="bg-discord-dark border-discord-danger">
            <CardContent className="pt-6">
              <p className="text-white mb-4">Transcript not found</p>
              <Button onClick={handleBack} variant="outline">
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
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center mb-2">
            <FileText className="h-6 w-6 text-discord-primary mr-3" />
            <h1 className="text-2xl font-bold text-white">Conversation Transcript</h1>
          </div>
          <p className="text-discord-text">{thread.guildName || "Unknown Server"}</p>
        </div>
        <Button onClick={handleBack} variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to My Tickets
        </Button>
      </div>

      {/* Thread Info */}
      <Card className="bg-discord-dark border-discord-darker mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-discord-muted" />
                <span className="text-white font-medium">{thread.userDisplayName}</span>
              </div>
              <Badge variant={thread.isClosed ? "secondary" : "default"} className={thread.isClosed ? "bg-discord-danger/20 text-discord-danger" : "bg-discord-success/20 text-discord-success"}>
                {thread.isClosed ? "Closed" : "Open"}
              </Badge>
              {thread.markedResolved && (
                <Badge variant="secondary" className="bg-discord-warning/20 text-discord-warning">
                  Resolved
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCopyTranscript} size="sm" variant="outline" className="border-discord-primary text-discord-primary hover:bg-discord-primary hover:text-white">
                <Copy className="h-4 w-4 mr-2" />
                {copySuccess ? "Copied!" : "Copy Text"}
              </Button>
              <Button onClick={handleDownloadTranscript} size="sm" className="bg-discord-primary hover:bg-discord-secondary">
                <Download className="h-4 w-4 mr-2" />
                Download HTML
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-discord-text">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 text-discord-muted mr-2" />
              <span>Created {formatTranscriptDate(thread.createdAt)}</span>
            </div>
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-discord-muted mr-2" />
              <span>Last activity {formatTranscriptDate(thread.lastUserActivityAt)}</span>
            </div>
            <div className="flex items-center">
              <MessageSquare className="h-4 w-4 text-discord-muted mr-2" />
              <span>{thread.messageCount} messages</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      <div className="bg-discord-dark rounded-lg border border-discord-darker">
        <div className="p-6 border-b border-discord-darker">
          <h2 className="text-white text-xl font-semibold">Conversation</h2>
        </div>
        <div className="p-6">
          {thread.messages && thread.messages.length > 0 ? (
            <div className="space-y-6">
              {thread.messages.map((message, index) => {
                const { displayContent, originalContent } = getDisplayContent(message);
                const staticAvatarUrl = getStaticAvatarUrl(message.authorAvatar);

                return (
                  <div key={message.messageId || index} className="flex gap-4">
                    <div className="flex-shrink-0">
                      {staticAvatarUrl ? (
                        <img src={staticAvatarUrl} alt={message.authorName} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-discord-primary flex items-center justify-center">
                          <span className="text-white text-sm font-medium">{(message.type === "user" ? thread.userDisplayName : message.authorName)?.charAt(0)?.toUpperCase() || "?"}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`font-semibold ${message.type === "user" ? "text-discord-primary" : "text-green-400"}`}>
                          {message.type === "user" ? thread.userDisplayName : message.authorName}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded border ${message.type === "user" ? "border-discord-primary text-discord-primary" : "border-green-400 text-green-400"}`}>
                          {message.type === "user" ? "User" : "Staff"}
                        </span>
                        <span className="text-xs text-gray-400">{formatTranscriptDate(message.createdAt)}</span>
                      </div>
                      <div className="text-gray-200 leading-relaxed">
                        {message.isEdited && originalContent ? (
                          <span className="relative cursor-help group" title={`Original message: ${originalContent}`}>
                            {displayContent}
                            <span className="text-xs text-gray-400 ml-2">(edited)</span>
                            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 max-w-sm p-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl border border-gray-600">
                              <div className="font-semibold text-gray-300 mb-2">Original message:</div>
                              <div className="whitespace-pre-wrap break-words">{originalContent}</div>
                            </div>
                          </span>
                        ) : (
                          <>
                            <span className="whitespace-pre-wrap break-words">{displayContent}</span>
                            {message.isEdited && <span className="text-xs text-gray-400 ml-2">(edited {message.editedAt ? formatTranscriptDate(message.editedAt) : ""})</span>}
                          </>
                        )}
                      </div>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {message.attachments.map((attachment, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-3 bg-gray-800 rounded border border-gray-700 text-sm">
                              <FileText className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-300">{attachment.filename}</span>
                              {attachment.url && (
                                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 ml-auto">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400">No messages found in this conversation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
