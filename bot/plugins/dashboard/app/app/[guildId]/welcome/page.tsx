/**
 * Welcome page — manage welcome message configuration.
 */
"use client";

import { useGuild } from "@/components/providers/GuildProvider";
import PermissionGate from "@/components/guards/PermissionGate";
import WelcomeConfigPage from "./WelcomeConfigPage";

export default function WelcomePage() {
  const { guild } = useGuild();

  return (
    <PermissionGate category="welcome">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome Messages</h1>
          <p className="text-zinc-400">Configure the message sent when new members join your server.</p>
        </div>
        <WelcomeConfigPage guildId={guild.id} />
      </div>
    </PermissionGate>
  );
}
