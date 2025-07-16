"use client";

import { useRequireGuild } from "./use-require-guild";

export function ModmailHome() {
  const { selectedGuild } = useRequireGuild();

  if (!selectedGuild) {
    return null; // The hook will handle redirection
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Modmail</h1>
        <p className="text-discord-muted">Manage modmail for {selectedGuild.guildName}</p>
      </div>

      <div className="text-center text-discord-muted py-12">
        <p>Modmail functionality coming soon...</p>
      </div>
    </div>
  );
}
