"use client";

import { useRequireGuild } from "./use-require-guild";

export function TranscriptsHome() {
  const { selectedGuild } = useRequireGuild();

  if (!selectedGuild) {
    return null; // The hook will handle redirection
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Transcripts</h1>
        <p className="text-discord-muted">View modmail transcripts for {selectedGuild.guildName}</p>
      </div>

      <div className="text-center text-discord-muted py-12">
        <p>Transcripts functionality coming soon...</p>
      </div>
    </div>
  );
}
