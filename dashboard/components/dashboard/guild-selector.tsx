"use client";

import { ChevronDown, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuild } from "./guild-provider";

export function GuildSelector() {
  const { guilds, selectedGuild, setSelectedGuild } = useGuild();

  if (guilds.length === 0) {
    return (
      <div className="flex items-center gap-2 text-discord-muted">
        <Server className="h-4 w-4" />
        <span>No accessible guilds</span>
      </div>
    );
  }

  if (guilds.length === 1) {
    return (
      <div className="flex items-center gap-2 text-white">
        <Server className="h-4 w-4 text-discord-primary" />
        <span className="font-medium">{guilds[0].guildName}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        className="bg-discord-darker border-discord-dark text-white hover:bg-discord-dark"
      >
        <Server className="h-4 w-4 mr-2 text-discord-primary" />
        {selectedGuild?.guildName || "Select Guild"}
        <ChevronDown className="h-4 w-4 ml-2" />
      </Button>

      {/* TODO: Add dropdown menu for guild selection */}
    </div>
  );
}
