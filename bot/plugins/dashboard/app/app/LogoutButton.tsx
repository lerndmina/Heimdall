/**
 * LogoutButton — Client component for signing out from the guild selector page.
 */
"use client";

import { signOut } from "next-auth/react";

interface LogoutButtonProps {
  user: {
    name?: string | null;
    image?: string | null;
  };
}

export default function LogoutButton({ user }: LogoutButtonProps) {
  return (
    <div className="flex items-center gap-3">
      {user.image && <img src={user.image} alt="" className="h-8 w-8 rounded-full" />}
      {user.name && <span className="text-sm text-zinc-400">{user.name}</span>}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-red-800/50 hover:text-red-400">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign Out
      </button>
    </div>
  );
}
