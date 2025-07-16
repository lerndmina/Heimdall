"use client";

import { RoleGuard } from "../auth/role-guard";
import { ServerCacheProvider } from "../dashboard/server-cache-provider";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

interface ServerSelectLayoutProps {
  user: User;
  children: React.ReactNode;
}

export function ServerSelectLayout({ user, children }: ServerSelectLayoutProps) {
  return (
    <RoleGuard allowedRoles={["staff"]}>
      <ServerCacheProvider userId={user.id}>
        <div className="min-h-screen bg-gradient-to-br from-discord-darkest to-discord-darker">
          <div className="container mx-auto px-4 py-16">{children}</div>
        </div>
      </ServerCacheProvider>
    </RoleGuard>
  );
}
