"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type UserRole = "user" | "staff" | null;

interface RoleContextType {
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  isUserMode: boolean;
  isStaffMode: boolean;
  clearRole: () => void;
  isLoading: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRoleState] = useState<UserRole>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load role from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Small delay to ensure localStorage is available
      const timer = setTimeout(() => {
        const savedRole = localStorage.getItem("heimdall-user-role") as UserRole;
        if (savedRole && (savedRole === "user" || savedRole === "staff")) {
          console.log(`Restored role from localStorage: ${savedRole}`);
          setUserRoleState(savedRole);
        }
        setIsLoading(false);
      }, 50);

      return () => clearTimeout(timer);
    }
  }, []);

  const setUserRole = (role: UserRole) => {
    setUserRoleState(role);
    if (typeof window !== "undefined") {
      if (role) {
        localStorage.setItem("heimdall-user-role", role);
      } else {
        localStorage.removeItem("heimdall-user-role");
      }
    }
  };

  const clearRole = () => {
    setUserRole(null);
  };

  const value: RoleContextType = {
    userRole,
    setUserRole,
    isUserMode: userRole === "user",
    isStaffMode: userRole === "staff",
    clearRole,
    isLoading,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}
