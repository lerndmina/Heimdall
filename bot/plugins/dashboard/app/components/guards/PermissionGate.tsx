/**
 * PermissionGate — Client-side guard that blocks page content
 * when the user lacks the required permission category.
 *
 * While permissions are loading it shows a spinner.
 * When loaded, if the user lacks access, it shows an access-denied message.
 */
"use client";

import { usePermissions } from "@/components/providers/PermissionsProvider";
import Spinner from "@/components/ui/Spinner";

interface PermissionGateProps {
  /** The permission category to check (e.g. "minecraft", "tickets") */
  category: string;
  children: React.ReactNode;
}

export default function PermissionGate({ category, children }: PermissionGateProps) {
  const { permissions, isOwner, loaded } = usePermissions();

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  // Guild owners bypass all permission checks
  if (isOwner) return <>{children}</>;

  // Check if the user has any permission in the category
  const hasAccess = Object.entries(permissions).some(([key, val]) => key.startsWith(category + ".") && val === true);

  if (!hasAccess) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700/30 bg-zinc-900/40 backdrop-blur-xl">
          <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-zinc-200">Access Denied</h2>
        <p className="mt-1 text-sm text-zinc-500">You don&apos;t have permission to access this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
