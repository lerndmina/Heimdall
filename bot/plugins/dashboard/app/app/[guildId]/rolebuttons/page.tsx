"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import RoleButtonsPage from "./RoleButtonsPage";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  return (
    <PermissionGate category="rolebuttons">
      <RoleButtonsPage guildId={guildId} />
    </PermissionGate>
  );
}
