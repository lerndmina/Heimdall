"use client";

import { useRole } from "../auth/role-provider";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface RoleGuardProps {
  allowedRoles: ("user" | "staff")[];
  children: React.ReactNode;
  fallbackPath?: string;
}

export function RoleGuard({ allowedRoles, children, fallbackPath = "/" }: RoleGuardProps) {
  const { userRole } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!userRole) {
      router.push(fallbackPath);
      return;
    }

    if (!allowedRoles.includes(userRole)) {
      router.push(fallbackPath);
      return;
    }
  }, [userRole, allowedRoles, router, fallbackPath]);

  // Don't render if no role or wrong role
  if (!userRole || !allowedRoles.includes(userRole)) {
    return null;
  }

  return <>{children}</>;
}
