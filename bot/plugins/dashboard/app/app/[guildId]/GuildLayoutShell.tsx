/**
 * Client-side guild layout shell — renders sidebar + content.
 * Wrapped by the server-side layout which provides guild info.
 *
 * Fetches user permissions on mount and filters sidebar items accordingly:
 * - If `hideDeniedFeatures` is true, items with no allowed actions are hidden.
 * - If false, inaccessible items are shown grayed out with a lock icon.
 */
"use client";

import GuildProvider, { type GuildInfo } from "@/components/providers/GuildProvider";
import PermissionsProvider, { usePermissions } from "@/components/providers/PermissionsProvider";
import Sidebar, { type NavItem } from "@/components/layout/Sidebar";
import { OverviewIcon, MinecraftIcon, ModmailIcon, TicketsIcon, SuggestionsIcon, TagsIcon, LoggingIcon, WelcomeIcon, TempVCIcon, RemindersIcon, SettingsIcon } from "@/components/icons";

/**
 * Nav item with its associated permission category key.
 * Items without a category (e.g. Overview) are always shown.
 */
interface NavItemDef {
  label: string;
  href: (guildId: string) => string;
  icon: React.ReactNode;
  /** Permission category key — if set, item visibility is based on permissions */
  category?: string;
}

const NAV_ITEMS: NavItemDef[] = [
  { label: "Overview", href: (id) => `/${id}`, icon: <OverviewIcon /> },
  { label: "Minecraft", href: (id) => `/${id}/minecraft`, icon: <MinecraftIcon />, category: "minecraft" },
  { label: "Modmail", href: (id) => `/${id}/modmail`, icon: <ModmailIcon />, category: "modmail" },
  { label: "Tickets", href: (id) => `/${id}/tickets`, icon: <TicketsIcon />, category: "tickets" },
  { label: "Suggestions", href: (id) => `/${id}/suggestions`, icon: <SuggestionsIcon />, category: "suggestions" },
  { label: "Tags", href: (id) => `/${id}/tags`, icon: <TagsIcon />, category: "tags" },
  { label: "Logging", href: (id) => `/${id}/logging`, icon: <LoggingIcon />, category: "logging" },
  { label: "Welcome", href: (id) => `/${id}/welcome`, icon: <WelcomeIcon />, category: "welcome" },
  { label: "Temp VC", href: (id) => `/${id}/tempvc`, icon: <TempVCIcon />, category: "tempvc" },
  { label: "Reminders", href: (id) => `/${id}/reminders`, icon: <RemindersIcon />, category: "reminders" },
  { label: "Settings", href: (id) => `/${id}/settings`, icon: <SettingsIcon />, category: "dashboard" },
];

function GuildLayoutInner({ guild, children }: { guild: GuildInfo; children: React.ReactNode }) {
  const { permissions, hideDeniedFeatures, isOwner, loaded } = usePermissions();

  function hasAnyCategoryAccess(categoryKey: string): boolean {
    if (isOwner) return true;
    return Object.entries(permissions).some(([key, val]) => key.startsWith(categoryKey + ".") && val === true);
  }

  const navItems: NavItem[] = NAV_ITEMS.map((def) => {
    const href = def.href(guild.id);
    const hasAccess = !def.category || isOwner || hasAnyCategoryAccess(def.category);

    // If permissions haven't loaded yet, show all items
    if (!loaded) return { label: def.label, href, icon: def.icon };

    if (!hasAccess) {
      if (hideDeniedFeatures) return null; // hide entirely
      return {
        label: def.label,
        href: `/${guild.id}/no-access`,
        icon: def.icon,
        locked: true,
      };
    }

    return { label: def.label, href, icon: def.icon };
  }).filter((item): item is NavItem => item !== null);

  return (
    <div className="flex h-screen">
      <Sidebar guildId={guild.id} guildName={guild.name} guildIcon={guild.icon} items={navItems} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
    </div>
  );
}

interface GuildLayoutShellProps {
  guild: GuildInfo;
  children: React.ReactNode;
}

export default function GuildLayoutShell({ guild, children }: GuildLayoutShellProps) {
  return (
    <GuildProvider guild={guild}>
      <PermissionsProvider guildId={guild.id}>
        <GuildLayoutInner guild={guild}>{children}</GuildLayoutInner>
      </PermissionsProvider>
    </GuildProvider>
  );
}
