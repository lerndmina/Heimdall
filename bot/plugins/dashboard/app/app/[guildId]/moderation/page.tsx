"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import ModerationPage from "./ModerationPage";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  return (
    <PermissionGate category="moderation">
      <ModerationPage guildId={guildId} />
    </PermissionGate>
  );
}
