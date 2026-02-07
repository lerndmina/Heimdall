/**
 * Client-side guild layout shell — renders sidebar + content.
 * Wrapped by the server-side layout which provides guild info.
 */
"use client";

import GuildProvider, { type GuildInfo } from "@/components/providers/GuildProvider";
import Sidebar, { type NavItem } from "@/components/layout/Sidebar";
import { OverviewIcon, MinecraftIcon, ModmailIcon, TicketsIcon, SuggestionsIcon, TagsIcon, LoggingIcon, WelcomeIcon, TempVCIcon, RemindersIcon } from "@/components/icons";

/**
 * All possible feature nav items.
 * In the future these will be filtered by what's actually enabled
 * on the bot, but for now we show them all as scaffold.
 */
function getNavItems(guildId: string): NavItem[] {
  return [
    {
      label: "Overview",
      href: `/${guildId}`,
      icon: <OverviewIcon />,
    },
    {
      label: "Minecraft",
      href: `/${guildId}/minecraft`,
      icon: <MinecraftIcon />,
    },
    {
      label: "Modmail",
      href: `/${guildId}/modmail`,
      icon: <ModmailIcon />,
    },
    {
      label: "Tickets",
      href: `/${guildId}/tickets`,
      icon: <TicketsIcon />,
    },
    {
      label: "Suggestions",
      href: `/${guildId}/suggestions`,
      icon: <SuggestionsIcon />,
    },
    {
      label: "Tags",
      href: `/${guildId}/tags`,
      icon: <TagsIcon />,
    },
    {
      label: "Logging",
      href: `/${guildId}/logging`,
      icon: <LoggingIcon />,
    },
    {
      label: "Welcome",
      href: `/${guildId}/welcome`,
      icon: <WelcomeIcon />,
    },
    {
      label: "Temp VC",
      href: `/${guildId}/tempvc`,
      icon: <TempVCIcon />,
    },
    {
      label: "Reminders",
      href: `/${guildId}/reminders`,
      icon: <RemindersIcon />,
    },
  ];
}

interface GuildLayoutShellProps {
  guild: GuildInfo;
  children: React.ReactNode;
}

export default function GuildLayoutShell({ guild, children }: GuildLayoutShellProps) {
  const navItems = getNavItems(guild.id);

  return (
    <GuildProvider guild={guild}>
      <div className="flex h-screen">
        <Sidebar guildId={guild.id} guildName={guild.name} guildIcon={guild.icon} items={navItems} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-6">{children}</div>
        </main>
      </div>
    </GuildProvider>
  );
}
