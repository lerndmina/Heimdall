/**
 * Sidebar navigation for guild dashboard layout.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import GuildIcon from "@/components/ui/GuildIcon";

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
  const { data: session } = useSession();
  const normalizedPathname = pathname?.replace(/\/+$/, "") || "/";
  const guildRoot = `/${guildId}`;

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-900/50">
      {/* Guild header */}
      <Link href="/" className="flex items-center gap-3 border-b border-zinc-800 px-4 py-4 transition hover:bg-zinc-800/50">
        <GuildIcon name={guildName} icon={guildIcon} guildId={guildId} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-100">{guildName}</p>
          <p className="text-xs text-zinc-500">Dashboard</p>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const normalizedHref = item.href.replace(/\/+$/, "") || "/";
            const isGuildRoot = normalizedHref === guildRoot;
            const isActive = isGuildRoot ? normalizedPathname === normalizedHref : normalizedPathname === normalizedHref || normalizedPathname.startsWith(normalizedHref + "/");

            if (item.locked) {
              return (
                <li key={item.href + item.label}>
                  <Link href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 cursor-not-allowed opacity-50">
                    <span className="h-5 w-5 shrink-0">{item.icon}</span>
                    {item.label}
                    <svg className="ml-auto h-4 w-4 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </Link>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? "bg-primary-500/10 text-primary-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}>
                  <span className="h-5 w-5 shrink-0">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      {session?.user && (
        <div className="border-t border-zinc-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            {session.user.image && <img src={session.user.image} alt="" className="h-8 w-8 rounded-full" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-200">{session.user.name}</p>
            </div>
            <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs text-zinc-500 transition hover:text-zinc-300" title="Sign out">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
