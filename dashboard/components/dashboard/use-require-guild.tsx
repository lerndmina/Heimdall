"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuild } from "./guild-provider";

const SELECTED_GUILD_KEY = "heimdall-selected-guild";

/**
 * Hook that redirects to server selection page if no guild is selected
 * Use this in components that require a selected guild
 */
export function useRequireGuild() {
  const { selectedGuild, guilds, isLoading } = useGuild();
  const router = useRouter();
  const [hasCheckedSessionStorage, setHasCheckedSessionStorage] = useState(false);

  useEffect(() => {
    // Give the guild provider time to restore from sessionStorage
    if (!hasCheckedSessionStorage) {
      const timer = setTimeout(() => {
        setHasCheckedSessionStorage(true);
      }, 100); // Small delay to allow sessionStorage restoration
      return () => clearTimeout(timer);
    }

    if (!isLoading && hasCheckedSessionStorage) {
      if (guilds.length === 0) {
        // No accessible guilds, redirect to server selector
        console.log("No accessible guilds, redirecting to server-select");
        router.push("/server-select");
      } else if (guilds.length > 0 && !selectedGuild) {
        // Has guilds but none selected, check sessionStorage one more time
        const savedGuildId = sessionStorage.getItem(SELECTED_GUILD_KEY);
        if (!savedGuildId) {
          console.log("Has guilds but none selected and no sessionStorage, redirecting to server-select");
          router.push("/server-select");
        }
      }
    }
  }, [selectedGuild, guilds, isLoading, router, hasCheckedSessionStorage]);

  return { selectedGuild, guilds, isLoading };
}
