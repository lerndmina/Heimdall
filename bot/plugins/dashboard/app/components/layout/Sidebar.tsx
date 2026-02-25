/**
 * Sidebar navigation for guild dashboard layout.
 */
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { MdLogout, MdSettings } from "react-icons/md";
import GuildIcon from "@/components/ui/GuildIcon";
import { useUnsavedChanges } from "@/components/providers/UnsavedChangesProvider";
import ConnectionIndicator from "@/components/layout/ConnectionIndicator";

/** A navigation item in the sidebar */
export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** When true, the item is shown grayed out with a lock icon */
  locked?: boolean;
}

interface SidebarProps {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  items: NavItem[];
}

export default function Sidebar({ guildId, guildName, guildIcon, items }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { confirmNavigation } = useUnsavedChanges();
  const normalizedPathname = pathname?.replace(/\/+$/, "") || "/";
  const guildRoot = `/${guildId}`;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingUserSettings, setLoadingUserSettings] = useState(false);
  const [savingUserSettings, setSavingUserSettings] = useState(false);
  const [applicationsAccordionMultiOpen, setApplicationsAccordionMultiOpen] = useState(false);

  async function loadUserSettings() {
    setLoadingUserSettings(true);
    try {
      const response = await fetch(`/api/guilds/${guildId}/dashboard-user-settings`, { cache: "no-store" });
      const json = await response.json().catch(() => null);
      const value = !!json?.data?.settings?.applicationsAccordionMultiOpen;
      setApplicationsAccordionMultiOpen(value);
    } finally {
      setLoadingUserSettings(false);
    }
  }

  async function saveUserSettings() {
    setSavingUserSettings(true);
    try {
      const response = await fetch(`/api/guilds/${guildId}/dashboard-user-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationsAccordionMultiOpen }),
      });

      if (response.ok) {
        window.dispatchEvent(
          new CustomEvent("dashboard:user-settings-updated", {
            detail: { applicationsAccordionMultiOpen },
          }),
        );
      }
    } finally {
      setSavingUserSettings(false);
    }
  }

  useEffect(() => {
    void loadUserSettings();
  }, [guildId]);

  function guardedNavigate(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    e.preventDefault();
    if (confirmNavigation()) router.push(href);
  }

  return (
    <aside className="relative flex w-full flex-col border-b border-zinc-700/30 bg-zinc-900/30 backdrop-blur-2xl lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
      {/* Sidebar glow accent */}
      <div className="pointer-events-none absolute inset-0 w-full overflow-hidden lg:w-64">
        <div className="absolute -left-20 top-[30%] h-60 w-60 animate-pulse rounded-full bg-primary-500/5 blur-[60px]" />
      </div>

      {/* Guild header */}
      <a href="/" onClick={(e) => guardedNavigate(e, "/")} className="relative flex items-center gap-3 border-b border-zinc-700/30 px-4 py-4 transition hover:bg-white/5">
        <GuildIcon name={guildName} icon={guildIcon} guildId={guildId} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-100">{guildName}</p>
          <p className="text-xs text-zinc-500">Dashboard</p>
        </div>
      </a>

      {/* Navigation */}
      <nav className="relative overflow-x-auto overflow-y-hidden p-3 lg:flex-1 lg:overflow-y-auto">
        <ul className="flex items-center gap-2 lg:block lg:space-y-1">
          {items.map((item) => {
            const normalizedHref = item.href.replace(/\/+$/, "") || "/";
            const isGuildRoot = normalizedHref === guildRoot;
            const isActive = isGuildRoot ? normalizedPathname === normalizedHref : normalizedPathname === normalizedHref || normalizedPathname.startsWith(normalizedHref + "/");

            if (item.locked) {
              return (
                <li key={item.href + item.label}>
                  <a
                    href={item.href}
                    onClick={(e) => guardedNavigate(e, item.href)}
                    className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 cursor-not-allowed opacity-50 whitespace-nowrap">
                    <span className="h-5 w-5 shrink-0">{item.icon}</span>
                    {item.label}
                    <svg className="ml-auto h-4 w-4 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </a>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={(e) => guardedNavigate(e, item.href)}
                  className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                    isActive ? "bg-primary-500/15 text-primary-400 shadow-sm shadow-primary-500/10" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}>
                  <span className={`h-5 w-5 shrink-0 transition-colors duration-300 ${isActive ? "text-primary-400" : ""}`}>{item.icon}</span>
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      {session?.user && (
        <div className="relative border-t border-zinc-700/30 p-3">
          <div className="mb-2 px-3">
            <ConnectionIndicator />
          </div>
          <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5">
            {session.user.image && <img src={session.user.image} alt="" className="h-8 w-8 rounded-full ring-2 ring-zinc-600/50" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-200">{session.user.name}</p>
            </div>
            <button onClick={() => setSettingsOpen((current) => !current)} className="text-xs text-zinc-500 transition hover:text-zinc-300" title="User settings" aria-label="User settings">
              <MdSettings className="h-4 w-4" aria-hidden="true" />
            </button>
            <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs text-zinc-500 transition hover:text-zinc-300" title="Sign out">
              <MdLogout className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {settingsOpen && (
            <div className="mt-2 rounded-lg border border-zinc-700/30 bg-zinc-900/90 p-3">
              <p className="text-xs font-medium text-zinc-200">User Preferences</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="text-xs text-zinc-300">Multi-open application accordion</label>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                  checked={applicationsAccordionMultiOpen}
                  onChange={(event) => setApplicationsAccordionMultiOpen(event.target.checked)}
                  disabled={loadingUserSettings || savingUserSettings}
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="rounded border border-zinc-700/30 px-2 py-1 text-xs text-zinc-300 transition hover:bg-white/5" onClick={() => setSettingsOpen(false)}>
                  Close
                </button>
                <button
                  type="button"
                  className="rounded border border-zinc-700/30 px-2 py-1 text-xs text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
                  onClick={() => void saveUserSettings()}
                  disabled={loadingUserSettings || savingUserSettings}>
                  {savingUserSettings ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
