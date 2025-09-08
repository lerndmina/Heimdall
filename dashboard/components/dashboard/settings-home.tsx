"use client";

import { useRequireGuild } from "./use-require-guild";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export function SettingsHome() {
  const { selectedGuild } = useRequireGuild();

  if (!selectedGuild) {
    return null; // The hook will handle redirection
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-discord-muted">Configure settings for {selectedGuild.guildName}</p>
      </div>
      <Card className="bg-discord-dark border-discord-darker">
        <CardHeader>
          <CardTitle className="flex items-center text-white">
            <Settings className="h-5 w-5 mr-2 text-discord-primary" />
            Under Construction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-discord-muted">This settings page is currently under construction. More features will be added soon!</p>
        </CardContent>
      </Card>
    </div>
  );
}