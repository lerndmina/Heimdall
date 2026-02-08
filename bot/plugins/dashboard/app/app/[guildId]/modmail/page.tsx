"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import Tabs from "@/components/ui/Tabs";
import ModmailConversationsTab from "./ModmailConversationsTab";
import ModmailConfigTab from "./ModmailConfigTab";
import ModmailCategoriesTab from "./ModmailCategoriesTab";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  const tabs = [
    {
      id: "conversations",
      label: "Conversations",
      content: <ModmailConversationsTab guildId={guildId} />,
    },
    {
      id: "categories",
      label: "Categories",
      content: <ModmailCategoriesTab guildId={guildId} />,
    },
    {
      id: "config",
      label: "Configuration",
      content: <ModmailConfigTab guildId={guildId} />,
    },
  ];

  return (
    <PermissionGate category="modmail">
      <Tabs tabs={tabs} />
    </PermissionGate>
  );
}
