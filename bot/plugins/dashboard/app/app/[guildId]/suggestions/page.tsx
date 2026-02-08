"use client";

import { use } from "react";
import PermissionGate from "@/components/guards/PermissionGate";
import Tabs from "@/components/ui/Tabs";
import SuggestionsListTab from "./SuggestionsListTab";
import SuggestionsConfigTab from "./SuggestionsConfigTab";
import SuggestionsCategoriesTab from "./SuggestionsCategoriesTab";

export default function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);

  const tabs = [
    {
      id: "list",
      label: "Suggestions",
      content: <SuggestionsListTab guildId={guildId} />,
    },
    {
      id: "config",
      label: "Configuration",
      content: <SuggestionsConfigTab guildId={guildId} />,
    },
    {
      id: "categories",
      label: "Categories",
      content: <SuggestionsCategoriesTab guildId={guildId} />,
    },
  ];

  return (
    <PermissionGate category="suggestions">
      <Tabs tabs={tabs} />
    </PermissionGate>
  );
}
