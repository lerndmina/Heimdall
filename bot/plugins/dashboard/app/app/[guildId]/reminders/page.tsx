"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import RemindersPage from "./RemindersPage";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  return (
    <PermissionGate category="reminders">
      <RemindersPage guildId={guildId} />
    </PermissionGate>
  );
}
