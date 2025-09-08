"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequireGuild } from "../use-require-guild";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { SuggestionCard } from "./SuggestionCard";
import { Suggestion, SuggestionStatus, SuggestionsResponse } from "../../../types/suggestion";
import { Search, Filter, RotateCcw } from "lucide-react";

export function SuggestionsList() {
  const { selectedGuild } = useRequireGuild();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | "all">("all");

  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [adminReason, setAdminReason] = useState("");

  const { data: suggestionsResponse, isLoading } = useQuery({
    queryKey: ["suggestions", selectedGuild?.guildId],
    queryFn: async () => {
      const result = await apiClient.getSuggestions(selectedGuild!.guildId);
      return result as SuggestionsResponse;
    },
    enabled: !!selectedGuild,
  });

  const updateSuggestionMutation = useMutation({
    mutationFn: ({ suggestionId, status }: { suggestionId: string; status: string }) => apiClient.updateSuggestion(selectedGuild!.guildId, suggestionId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", selectedGuild?.guildId] });
      toast({ title: "Suggestion updated successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update suggestion",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteSuggestionMutation = useMutation({
    mutationFn: (suggestionId: string) => apiClient.deleteSuggestion(selectedGuild!.guildId, suggestionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", selectedGuild?.guildId] });
      toast({ title: "Suggestion deleted successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete suggestion",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const suggestions = suggestionsResponse?.data || [];

  const filteredSuggestions = suggestions.filter((suggestion: Suggestion) => {
    const matchesSearch =
      searchTerm === "" ||
      suggestion.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      suggestion.suggestion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      suggestion.reason.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || suggestion.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleApprove = (suggestionId: string) => {
    const suggestion = suggestions.find((s: Suggestion) => s.id === suggestionId);
    if (suggestion) openApproveDialog(suggestion);
  };

  const handleDeny = (suggestionId: string) => {
    const suggestion = suggestions.find((s: Suggestion) => s.id === suggestionId);
    if (suggestion) openDenyDialog(suggestion);
  };

  const handleDelete = (suggestionId: string) => {
    const suggestion = suggestions.find((s: Suggestion) => s.id === suggestionId);
    if (suggestion) openDeleteDialog(suggestion);
  };

  // Confirmation handlers
  const openApproveDialog = (suggestion: Suggestion) => {
    setSelectedSuggestion(suggestion);
    setApproveDialogOpen(true);
  };

  const openDenyDialog = (suggestion: Suggestion) => {
    setSelectedSuggestion(suggestion);
    setAdminReason("");
    setDenyDialogOpen(true);
  };

  const openDeleteDialog = (suggestion: Suggestion) => {
    setSelectedSuggestion(suggestion);
    setDeleteDialogOpen(true);
  };

  const confirmApprove = () => {
    if (selectedSuggestion) {
      handleApprove(selectedSuggestion.id);
      setApproveDialogOpen(false);
      setSelectedSuggestion(null);
    }
  };

  const confirmDeny = () => {
    if (selectedSuggestion) {
      handleDeny(selectedSuggestion.id);
      setDenyDialogOpen(false);
      setSelectedSuggestion(null);
      setAdminReason("");
    }
  };

  const confirmDelete = () => {
    if (selectedSuggestion) {
      deleteSuggestionMutation.mutate(selectedSuggestion.id);
      setDeleteDialogOpen(false);
      setSelectedSuggestion(null);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
  };

  if (isLoading) {
    return (
      <Card className="bg-discord-dark border-discord-darker">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-discord-muted">Loading suggestions...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-discord-dark border-discord-darker">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Suggestion Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{suggestions.length}</div>
              <div className="text-sm text-discord-muted">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{suggestions.filter((s: Suggestion) => s.status === SuggestionStatus.Pending).length}</div>
              <div className="text-sm text-discord-muted">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{suggestions.filter((s: Suggestion) => s.status === SuggestionStatus.Approved).length}</div>
              <div className="text-sm text-discord-muted">Approved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{suggestions.filter((s: Suggestion) => s.status === SuggestionStatus.Denied).length}</div>
              <div className="text-sm text-discord-muted">Denied</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-discord-muted" />
              <Input placeholder="Search suggestions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 bg-discord-darker border-discord-dark text-white" />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SuggestionStatus | "all")}>
              <SelectTrigger className="w-full sm:w-48 bg-discord-darker border-discord-dark text-white">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-discord-darker border-discord-dark">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value={SuggestionStatus.Pending}>Pending</SelectItem>
                <SelectItem value={SuggestionStatus.Approved}>Approved</SelectItem>
                <SelectItem value={SuggestionStatus.Denied}>Denied</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleResetFilters} className="border-discord-dark hover:bg-discord-darker">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-discord-muted">
              Showing {filteredSuggestions.length} of {suggestions.length} suggestions
            </div>
            {(searchTerm || statusFilter !== "all") && (
              <Badge variant="outline" className="border-discord-dark">
                Filtered
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Suggestions Grid */}
      <div className="grid gap-6">
        {filteredSuggestions.length === 0 ? (
          <Card className="bg-discord-dark border-discord-darker">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-discord-muted text-center">
                {searchTerm || statusFilter !== "all" ? (
                  <>
                    <div className="text-lg font-medium mb-2">No suggestions found</div>
                    <div>Try adjusting your search terms or filters</div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-medium mb-2">No suggestions yet</div>
                    <div>Suggestions will appear here when users submit them</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredSuggestions.map((suggestion: Suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onApprove={handleApprove}
              onDeny={handleDeny}
              onDelete={handleDelete}
              isLoading={updateSuggestionMutation.isPending || deleteSuggestionMutation.isPending}
            />
          ))
        )}
      </div>

      {/* Confirmation Dialogs */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="bg-discord-dark border-discord-darker text-white">
          <DialogHeader>
            <DialogTitle>Approve Suggestion</DialogTitle>
            <DialogDescription className="text-discord-muted">Are you sure you want to approve "{selectedSuggestion?.title}"? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)} className="border-discord-dark hover:bg-discord-darker">
              Cancel
            </Button>
            <Button onClick={confirmApprove} className="bg-green-600 hover:bg-green-700">
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
        <DialogContent className="bg-discord-dark border-discord-darker text-white">
          <DialogHeader>
            <DialogTitle>Deny Suggestion</DialogTitle>
            <DialogDescription className="text-discord-muted">Are you sure you want to deny "{selectedSuggestion?.title}"? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="reason" className="text-sm font-medium">
                Reason (optional)
              </label>
              <Textarea
                id="reason"
                placeholder="Provide a reason for denying this suggestion..."
                value={adminReason}
                onChange={(e) => setAdminReason(e.target.value)}
                className="mt-1 bg-discord-darker border-discord-dark text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyDialogOpen(false)} className="border-discord-dark hover:bg-discord-darker">
              Cancel
            </Button>
            <Button onClick={confirmDeny} className="bg-red-600 hover:bg-red-700">
              Deny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-discord-dark border-discord-darker text-white">
          <DialogHeader>
            <DialogTitle>Delete Suggestion</DialogTitle>
            <DialogDescription className="text-discord-muted">
              Are you sure you want to permanently delete "{selectedSuggestion?.title}"? This action cannot be undone and will remove the suggestion entirely.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="border-discord-dark hover:bg-discord-darker">
              Cancel
            </Button>
            <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
