"use client";

import { useGuild } from "@/components/providers/GuildProvider";
import PermissionGate from "@/components/guards/PermissionGate";
import StarboardConfigPage from "./StarboardConfigPage";

export default function StarboardPage() {
  const { guild } = useGuild();

  return (
    <PermissionGate category="starboard">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Starboard</h1>
          <p className="text-zinc-400">Configure reaction-based highlights with optional moderation approval.</p>
        </div>
        <StarboardConfigPage guildId={guild.id} />
      </div>
    </PermissionGate>
  );
}
