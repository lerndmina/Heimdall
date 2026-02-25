/**
 * LogoutButton — Client component for signing out from the guild selector page.
 */
"use client";

import { signOut } from "next-auth/react";
import { MdLogout } from "react-icons/md";

interface LogoutButtonProps {
  user: {
    name?: string | null;
    image?: string | null;
  };
}

export default function LogoutButton({ user }: LogoutButtonProps) {
  return (
    <div className="flex items-center gap-3">
      {user.image && <img src={user.image} alt="" className="h-8 w-8 rounded-full ring-2 ring-ui-border" />}
      {user.name && <span className="text-sm text-ui-text-muted">{user.name}</span>}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-1.5 rounded-lg border border-ui-border bg-ui-bg-subtle px-3 py-1.5 text-xs font-medium text-ui-text-muted transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400">
        <MdLogout className="h-3.5 w-3.5" />
        Sign Out
      </button>
    </div>
  );
}
