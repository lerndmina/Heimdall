"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import TagsPage from "./TagsPage";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  return (
    <PermissionGate category="tags">
      <TagsPage guildId={guildId} />
    </PermissionGate>
  );
}
