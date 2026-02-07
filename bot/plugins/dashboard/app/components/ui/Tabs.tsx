/**
 * Tabs — client-side tabbed navigation component.
 */
"use client";

import { useState, type ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  className?: string;
}

export default function Tabs({ tabs, defaultTab, className = "" }: TabsProps) {
  const [activeId, setActiveId] = useState(defaultTab ?? tabs[0]?.id);

  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <div className={className}>
      {/* Tab list */}
      <div className="flex gap-1 border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveId(tab.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeId === tab.id ? "border-primary-500 text-primary-400" : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
            }`}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-6">{activeTab?.content}</div>
    </div>
  );
}
