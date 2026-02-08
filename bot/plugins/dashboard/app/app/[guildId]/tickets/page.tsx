"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import Tabs from "@/components/ui/Tabs";
import TicketsListTab from "./TicketsListTab";
import TicketCategoriesTab from "./TicketCategoriesTab";
import TicketOpenersTab from "./TicketOpenersTab";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  const tabs = [
    {
      id: "tickets",
      label: "Tickets",
      content: <TicketsListTab guildId={guildId} />,
    },
    {
      id: "categories",
      label: "Categories",
      content: <TicketCategoriesTab guildId={guildId} />,
    },
    {
      id: "openers",
      label: "Openers",
      content: <TicketOpenersTab guildId={guildId} />,
    },
  ];

  return (
    <PermissionGate category="tickets">
      <Tabs tabs={tabs} />
    </PermissionGate>
  );
}
