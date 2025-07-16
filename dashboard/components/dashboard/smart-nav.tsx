"use client";

import { useRole } from "../auth/role-provider";
import { DashboardNav } from "./dashboard-nav";
import { UserNav } from "./user-nav";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

export function SmartNav({ user }: { user: User }) {
  const { userRole, isUserMode, isStaffMode } = useRole();

  // Don't render navigation if no role is selected
  if (!userRole) {
    return null;
  }

  // Render appropriate navigation based on role
  if (isUserMode) {
    return <UserNav user={user} />;
  }

  if (isStaffMode) {
    return <DashboardNav user={user} />;
  }

  return null;
}
