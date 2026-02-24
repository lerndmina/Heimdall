/**
 * Client-side guild layout shell — renders sidebar + content.
 * Wrapped by the server-side layout which provides guild info.
 *
 * Fetches user permissions on mount and filters sidebar items accordingly:
 * - If `hideDeniedFeatures` is true, items with no allowed actions are hidden.
 * - If false, inaccessible items are shown grayed out with a lock icon.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import GuildProvider, { type GuildInfo } from "@/components/providers/GuildProvider";
import PermissionsProvider, { usePermissions } from "@/components/providers/PermissionsProvider";
import UnsavedChangesProvider from "@/components/providers/UnsavedChangesProvider";
import Sidebar, { type NavItem } from "@/components/layout/Sidebar";
import { fetchRuntimeConfig } from "@/lib/runtimeConfig";
import { isPluginEnabled, parseEnabledPlugins } from "@/lib/integrations";
import {
  OverviewIcon,
  MinecraftIcon,
  ModmailIcon,
  TicketsIcon,
  SuggestionsIcon,
  TagsIcon,
  RoleButtonsIcon,
  LoggingIcon,
  WelcomeIcon,
  StarboardIcon,
  TempVCIcon,
  RemindersIcon,
  VCTranscriptionIcon,
  AttachmentBlockerIcon,
  ModerationIcon,
  PlanetSideIcon,
  SettingsIcon,
} from "@/components/icons";

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
  plugin?: string;
}

const NAV_ITEMS: NavItemDef[] = [
  { label: "Overview", href: (id) => `/${id}`, icon: <OverviewIcon /> },
  { label: "Minecraft", href: (id) => `/${id}/minecraft`, icon: <MinecraftIcon />, category: "minecraft", plugin: "minecraft" },
  { label: "Modmail", href: (id) => `/${id}/modmail`, icon: <ModmailIcon />, category: "modmail", plugin: "modmail" },
  { label: "Tickets", href: (id) => `/${id}/tickets`, icon: <TicketsIcon />, category: "tickets", plugin: "tickets" },
  { label: "Suggestions", href: (id) => `/${id}/suggestions`, icon: <SuggestionsIcon />, category: "suggestions", plugin: "suggestions" },
  { label: "Tags", href: (id) => `/${id}/tags`, icon: <TagsIcon />, category: "tags", plugin: "tags" },
  { label: "Role Buttons", href: (id) => `/${id}/rolebuttons`, icon: <RoleButtonsIcon />, category: "rolebuttons", plugin: "rolebuttons" },
  { label: "Logging", href: (id) => `/${id}/logging`, icon: <LoggingIcon />, category: "logging", plugin: "logging" },
  { label: "Welcome", href: (id) => `/${id}/welcome`, icon: <WelcomeIcon />, category: "welcome", plugin: "welcome" },
  { label: "Starboard", href: (id) => `/${id}/starboard`, icon: <StarboardIcon />, category: "starboard", plugin: "starboard" },
  { label: "Temp VC", href: (id) => `/${id}/tempvc`, icon: <TempVCIcon />, category: "tempvc", plugin: "tempvc" },
  { label: "Reminders", href: (id) => `/${id}/reminders`, icon: <RemindersIcon />, category: "reminders", plugin: "reminders" },
  { label: "VC Transcription", href: (id) => `/${id}/vc-transcription`, icon: <VCTranscriptionIcon />, category: "vc-transcription", plugin: "vc-transcription" },
  { label: "Attachment Blocker", href: (id) => `/${id}/attachment-blocker`, icon: <AttachmentBlockerIcon />, category: "attachment-blocker", plugin: "attachment-blocker" },
  { label: "Moderation", href: (id) => `/${id}/moderation`, icon: <ModerationIcon />, category: "moderation", plugin: "moderation" },
  { label: "PlanetSide", href: (id) => `/${id}/planetside`, icon: <PlanetSideIcon />, category: "planetside", plugin: "planetside" },
  { label: "Settings", href: (id) => `/${id}/settings`, icon: <SettingsIcon />, category: "dashboard" },
];

// Sort alphabetically with Overview pinned first and Settings last
NAV_ITEMS.sort((a, b) => {
  if (a.label === "Overview") return -1;
  if (b.label === "Overview") return 1;
  if (a.label === "Settings") return 1;
  if (b.label === "Settings") return -1;
  return a.label.localeCompare(b.label);
});

function GuildLayoutInner({ guild, children }: { guild: GuildInfo; children: React.ReactNode }) {
  const { permissions, hideDeniedFeatures, isOwner, isBotOwner, isAdministrator, denyAccess, loaded } = usePermissions();
  const hasFullAccess = isOwner || isBotOwner || (isAdministrator && !denyAccess);
  const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());
  const [runtimeLoaded, setRuntimeLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const runtime = await fetchRuntimeConfig();
      if (!alive) return;
      setEnabledPlugins(runtime ? new Set(runtime.enabledPlugins.map((p) => p.toLowerCase())) : parseEnabledPlugins(undefined));
      setRuntimeLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function hasAnyCategoryAccess(categoryKey: string): boolean {
    if (hasFullAccess) return true;
    return Object.entries(permissions).some(([key, val]) => key.startsWith(categoryKey + ".") && val === true);
  }

  // If dashboard access is denied for this user, show access denied
  // Bot owners always bypass deny_access
  if (loaded && denyAccess && !hasFullAccess) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700/30 bg-zinc-900/40 backdrop-blur-xl">
            <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-200">Dashboard Access Denied</h2>
          <p className="mt-1 text-sm text-zinc-500">Your role has been restricted from accessing this server&apos;s dashboard.</p>
          <a
            href="/"
            className="mt-4 inline-block rounded-lg border border-zinc-700/30 bg-zinc-900/40 px-4 py-2 text-sm font-medium text-zinc-300 backdrop-blur-xl transition-all duration-300 hover:border-zinc-600/40 hover:text-zinc-100 hover:shadow-lg">
            ← Back to servers
          </a>
        </div>
      </div>
    );
  }

  const navItems: NavItem[] = useMemo(
    () =>
      NAV_ITEMS.map((def) => {
        if (runtimeLoaded && !isPluginEnabled(enabledPlugins, def.plugin ?? null)) {
          return null;
        }

        const href = def.href(guild.id);
        const hasAccess = !def.category || hasFullAccess || hasAnyCategoryAccess(def.category);

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
      }).filter((item): item is NavItem => item !== null),
    [enabledPlugins, guild.id, hasFullAccess, hideDeniedFeatures, loaded, runtimeLoaded, permissions],
  );

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      <Sidebar guildId={guild.id} guildName={guild.name} guildIcon={guild.icon} items={navItems} />
      <main className="flex-1 overflow-y-auto lg:min-h-0">
        <div className="mx-auto max-w-6xl p-4 sm:p-6">{children}</div>
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
        <UnsavedChangesProvider>
          <GuildLayoutInner guild={guild}>{children}</GuildLayoutInner>
        </UnsavedChangesProvider>
      </PermissionsProvider>
    </GuildProvider>
  );
}
