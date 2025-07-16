"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuild } from "./guild-provider";

export function GuildSelector() {
  const { guilds, selectedGuild, setSelectedGuild } = useGuild();
  const router = useRouter();

  const handleSelectGuild = () => {
    router.push("/server-select");
  };

  if (guilds.length === 0) {
    return (
      <Button variant="outline" onClick={handleSelectGuild} className="bg-discord-darker border-discord-dark text-discord-muted hover:bg-discord-dark hover:text-white">
        <Server className="h-4 w-4 mr-2" />
        No accessible guilds
      </Button>
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
      <Button variant="outline" onClick={handleSelectGuild} className="bg-discord-darker border-discord-dark text-white hover:bg-discord-dark">
        <Server className="h-4 w-4 mr-2 text-discord-primary" />
        {selectedGuild?.guildName || "Select Guild"}
        <ChevronDown className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
