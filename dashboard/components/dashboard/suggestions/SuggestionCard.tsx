"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, X, Trash2, ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";
import { Suggestion, SuggestionStatus, VoteType } from "../../../types/suggestion";

interface SuggestionCardProps {
  suggestion: Suggestion;
  onApprove?: (suggestionId: string) => void;
  onDeny?: (suggestionId: string) => void;
  onDelete?: (suggestionId: string) => void;
  isLoading?: boolean;
}

export function SuggestionCard({ suggestion, onApprove, onDeny, onDelete, isLoading = false }: SuggestionCardProps) {
  const upvotes = suggestion.votes.filter((vote) => vote.vote === VoteType.Upvote).length;
  const downvotes = suggestion.votes.filter((vote) => vote.vote === VoteType.Downvote).length;
  const totalVotes = upvotes + downvotes;
  const voteRatio = totalVotes > 0 ? (upvotes / totalVotes) * 100 : 0;

  const getStatusColor = (status: SuggestionStatus) => {
    switch (status) {
      case SuggestionStatus.Approved:
        return "bg-green-500/20 text-green-400 border-green-500/50";
      case SuggestionStatus.Denied:
        return "bg-red-500/20 text-red-400 border-red-500/50";
      default:
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
    }
  };

  const getStatusText = (status: SuggestionStatus) => {
    switch (status) {
      case SuggestionStatus.Approved:
        return "Approved";
      case SuggestionStatus.Denied:
        return "Denied";
      default:
        return "Pending";
    }
  };

  const getUserDisplayName = () => {
    if (suggestion.user) {
      return suggestion.user.globalName || suggestion.user.username;
    }
    return `User ${suggestion.userId}`;
  };

  const getUserAvatar = () => {
    if (suggestion.user?.avatar) {
      return `https://cdn.discordapp.com/avatars/${suggestion.user.id}/${suggestion.user.avatar}.png`;
    }
    return null;
  };

  return (
    <Card className="bg-discord-dark border-discord-darker">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg">{suggestion.title}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(suggestion.status)}>{getStatusText(suggestion.status)}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={getUserAvatar() || undefined} />
            <AvatarFallback className="bg-discord-darker text-white text-xs">{getUserDisplayName().slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-white text-sm font-medium">{getUserDisplayName()}</span>
            <span className="text-discord-muted text-xs">ID: {suggestion.userId}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <h4 className="text-white text-sm font-medium mb-2">Suggestion</h4>
          <p className="text-discord-muted text-sm leading-relaxed">{suggestion.suggestion}</p>
        </div>

        <div>
          <h4 className="text-white text-sm font-medium mb-2">Reason</h4>
          <p className="text-discord-muted text-sm leading-relaxed">{suggestion.reason}</p>
        </div>

        {/* Vote Summary */}
        <div className="flex items-center gap-4 py-2">
          <div className="flex items-center gap-1">
            <ThumbsUp className="h-4 w-4 text-green-400" />
            <span className="text-green-400 text-sm font-medium">{upvotes}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThumbsDown className="h-4 w-4 text-red-400" />
            <span className="text-red-400 text-sm font-medium">{downvotes}</span>
          </div>
          {totalVotes > 0 && (
            <div className="flex-1 ml-2">
              <div className="w-full bg-discord-darker rounded-full h-2">
                <div className="bg-green-400 h-2 rounded-full transition-all duration-300" style={{ width: `${voteRatio}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-discord-darker">
          <div className="flex gap-2">
            {suggestion.status === SuggestionStatus.Pending && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-green-400 hover:text-green-300 hover:bg-green-500/10" onClick={() => onApprove?.(suggestion.id)} disabled={isLoading}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Approve suggestion</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {suggestion.status === SuggestionStatus.Pending && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => onDeny?.(suggestion.id)} disabled={isLoading}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Deny suggestion</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-300 hover:bg-gray-500/10" onClick={() => onDelete?.(suggestion.id)} disabled={isLoading}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete suggestion</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="text-discord-muted hover:text-white" onClick={() => window.open(suggestion.messageLink, "_blank")}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View original message</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
