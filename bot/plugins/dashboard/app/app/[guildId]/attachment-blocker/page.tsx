/**
 * Attachment Blocker page — manage attachment blocking rules.
 */
"use client";

import { useGuild } from "@/components/providers/GuildProvider";
import PermissionGate from "@/components/guards/PermissionGate";
import AttachmentBlockerPage from "./AttachmentBlockerPage";

export default function AttachmentBlockerPageWrapper() {
  const { guild } = useGuild();

  return (
    <PermissionGate category="attachment-blocker">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attachment Blocker</h1>
          <p className="text-zinc-400">Control which attachment types are allowed in your server channels.</p>
        </div>
        <AttachmentBlockerPage guildId={guild.id} />
      </div>
    </PermissionGate>
  );
}
