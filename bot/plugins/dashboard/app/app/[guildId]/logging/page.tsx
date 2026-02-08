/**
 * Logging page — manage logging configuration.
 */
"use client";

import { useGuild } from "@/components/providers/GuildProvider";
import PermissionGate from "@/components/guards/PermissionGate";
import LoggingConfigPage from "./LoggingConfigPage";

export default function LoggingPage() {
  const { guild } = useGuild();

  return (
    <PermissionGate category="logging">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logging</h1>
          <p className="text-zinc-400">Configure event logging to track messages, users, and moderation actions.</p>
        </div>
        <LoggingConfigPage guildId={guild.id} />
      </div>
    </PermissionGate>
  );
}
