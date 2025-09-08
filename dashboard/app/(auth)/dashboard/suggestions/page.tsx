"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequireGuild } from "../../../../components/dashboard/use-require-guild";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SuggestionsPage() {
  const { selectedGuild } = useRequireGuild();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["suggestions", selectedGuild?.guildId],
    queryFn: () => apiClient.getSuggestions(selectedGuild!.guildId),
    enabled: !!selectedGuild,
  });

  const updateSuggestionMutation = useMutation({
    mutationFn: ({ suggestionId, status }: { suggestionId: string, status: string }) => 
      apiClient.updateSuggestion(selectedGuild!.guildId, suggestionId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", selectedGuild?.guildId] });
      toast({ title: "Suggestion updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to update suggestion", description: error.message, variant: "destructive" });
    },
  });

  const deleteSuggestionMutation = useMutation({
    mutationFn: (suggestionId: string) => 
      apiClient.deleteSuggestion(selectedGuild!.guildId, suggestionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", selectedGuild?.guildId] });
      toast({ title: "Suggestion deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to delete suggestion", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Card className="bg-discord-dark border-discord-darker">
      <CardHeader>
        <CardTitle className="text-white">Suggestions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-white">Title</TableHead>
              <TableHead className="text-white">User</TableHead>
              <TableHead className="text-white">Status</TableHead>
              <TableHead className="text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(suggestions as any)?.data?.map((suggestion: any) => (
              <TableRow key={suggestion.id}>
                <TableCell className="text-white">{suggestion.title}</TableCell>
                <TableCell className="text-discord-muted">{suggestion.userId}</TableCell>
                <TableCell>
                  <Badge variant={suggestion.status === 'approved' ? 'default' : suggestion.status === 'denied' ? 'destructive' : 'outline'}>
                    {suggestion.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => updateSuggestionMutation.mutate({ suggestionId: suggestion.id, status: 'approved' })}>
                    <Check className="h-4 w-4 text-green-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => updateSuggestionMutation.mutate({ suggestionId: suggestion.id, status: 'denied' })}>
                    <X className="h-4 w-4 text-red-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteSuggestionMutation.mutate(suggestion.id)}>
                    <Trash2 className="h-4 w-4 text-gray-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
