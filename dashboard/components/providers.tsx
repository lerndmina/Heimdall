"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { RoleProvider } from "@/components/auth/role-provider";
import { DynamicTitle } from "@/components/dynamic-title";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
            retry: (failureCount, error: any) => {
              // Don't retry on rate limiting or auth errors
              if (error?.status === 429 || error?.status === 403 || error?.status === 401) {
                return false;
              }
              return failureCount < 2;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
            refetchOnWindowFocus: false, // Prevent excessive refetching
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <RoleProvider>
            <DynamicTitle />
            {children}
            <Toaster />
          </RoleProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
