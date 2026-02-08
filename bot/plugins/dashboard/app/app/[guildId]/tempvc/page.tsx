/**
 * Temp VC page — manage temporary voice channel configuration and view active channels.
 */
"use client";

import { useGuild } from "@/components/providers/GuildProvider";
import PermissionGate from "@/components/guards/PermissionGate";
import Tabs from "@/components/ui/Tabs";
import TempVCConfigTab from "./TempVCConfigTab";
import TempVCActiveTab from "./TempVCActiveTab";

export default function TempVCPage() {
  const { guild } = useGuild();

  const tabs = [
    {
      id: "config",
      label: "Configuration",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      content: <TempVCConfigTab guildId={guild.id} />,
    },
    {
      id: "active",
      label: "Active Channels",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-8.464a5 5 0 000 7.072M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728"
          />
        </svg>
      ),
      content: <TempVCActiveTab guildId={guild.id} />,
    },
  ];

  return (
    <PermissionGate category="tempvc">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Temporary Voice Channels</h1>
          <p className="text-zinc-400">Configure creator channels and manage active temporary VCs.</p>
        </div>
        <Tabs tabs={tabs} defaultTab="config" />
      </div>
    </PermissionGate>
  );
}
