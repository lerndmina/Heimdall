"use client";

import { useRequireGuild } from "./use-require-guild";

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

      <div className="text-center text-discord-muted py-12">
        <p>Settings functionality coming soon...</p>
      </div>
    </div>
  );
}
