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
  const { userRole, isStaffMode, isLoading } = useRole();
  const router = useRouter();

  // Redirect to role selection if no role is chosen (only after loading is complete)
  useEffect(() => {
    if (!isLoading && !userRole) {
      console.log("No user role found after loading from localStorage, redirecting to role selection");
      router.push("/");
    }
  }, [userRole, router, isLoading]);

  // If still loading or no role selected, don't render anything
  if (isLoading || !userRole) {
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
