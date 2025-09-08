"use client";

import { useRequireGuild } from "./use-require-guild";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export function DashboardHome() {
  const { selectedGuild } = useRequireGuild();

  if (!selectedGuild) {
    return null; // The hook will handle redirection
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-discord-muted">Welcome to the dashboard for {selectedGuild.guildName}</p>
      </div>
      <Card className="bg-discord-dark border-discord-darker">
        <CardHeader>
          <CardTitle className="flex items-center text-white">
            <Info className="h-5 w-5 mr-2 text-discord-primary" />
            Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-discord-muted">This is the main dashboard. Use the navigation on the left to access different features.</p>
        </CardContent>
      </Card>
    </div>
  );
}