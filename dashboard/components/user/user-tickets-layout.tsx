"use client";

import { RoleGuard } from "../auth/role-guard";
import { SmartNav } from "../dashboard/smart-nav";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

interface UserTicketsLayoutProps {
  user: User;
  children: React.ReactNode;
}

export function UserTicketsLayout({ user, children }: UserTicketsLayoutProps) {
  return (
    <RoleGuard allowedRoles={["user"]}>
      <div className="min-h-screen bg-gradient-to-br from-discord-darkest to-discord-darker">
        <SmartNav user={user} />
        <div className="container mx-auto px-4 py-16">{children}</div>
      </div>
    </RoleGuard>
  );
}
