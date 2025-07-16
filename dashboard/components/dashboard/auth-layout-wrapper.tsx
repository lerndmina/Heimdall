"use client";

import { useRole } from "../auth/role-provider";
import { GuildProvider } from "./guild-provider";
import { ServerCacheProvider } from "./server-cache-provider";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string;
}

interface AuthLayoutWrapperProps {
  user: User;
  children: React.ReactNode;
}

export function AuthLayoutWrapper({ user, children }: AuthLayoutWrapperProps) {
  const { userRole, isStaffMode } = useRole();
  const router = useRouter();

  // Redirect to role selection if no role is chosen
  useEffect(() => {
    if (!userRole) {
      router.push("/");
    }
  }, [userRole, router]);

  // If no role selected, don't render anything (will redirect)
  if (!userRole) {
    return null;
  }

  // Only wrap with providers if in staff mode
  if (isStaffMode) {
    return (
      <ServerCacheProvider userId={user.id}>
        <GuildProvider userId={user.id}>{children}</GuildProvider>
      </ServerCacheProvider>
    );
  }

  // For user mode, don't need providers
  return <>{children}</>;
}
