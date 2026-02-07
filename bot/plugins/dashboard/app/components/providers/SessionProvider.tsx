/**
 * Client-side NextAuth SessionProvider wrapper.
 */
"use client";

import { SessionProvider as NextSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export default function SessionProvider({ children }: { children: ReactNode }) {
  return <NextSessionProvider>{children}</NextSessionProvider>;
}
