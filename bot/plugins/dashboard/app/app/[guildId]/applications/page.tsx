"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import ApplicationsPage from "./ApplicationsPage";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  return (
    <PermissionGate category="applications">
      <ApplicationsPage guildId={guildId} />
    </PermissionGate>
  );
}
