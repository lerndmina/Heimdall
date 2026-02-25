"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import ModerationPage from "./ModerationPage";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  return (
    <PermissionGate category="moderation">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Moderation</h1>
          <p className="text-zinc-400">Manage automod rules, infractions, escalation tiers, and settings.</p>
        </div>
        <ModerationPage guildId={guildId} />
      </div>
    </PermissionGate>
  );
}
