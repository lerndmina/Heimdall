/**
 * GuildIcon — renders a Discord guild icon or initials fallback.
 *
 * If the guild has a custom icon, renders an <img> from Discord CDN.
 * Otherwise renders a circle with the server's initials
 * (first letter of each word, up to 3) matching Discord's default style.
 */
"use client";

import { useState } from "react";
import { guildIconUrl, guildIconUrlStatic, guildInitials, isAnimatedIcon } from "@/lib/discord";

interface GuildIconProps {
  /** Guild display name */
  name: string;
  /** Guild icon hash (null if no custom icon) */
  icon: string | null;
  /** Guild snowflake ID */
  guildId: string;
  /** Tailwind size/shape classes, e.g. "h-12 w-12" */
  className?: string;
}

export default function GuildIcon({ name, icon, guildId, className = "h-10 w-10" }: GuildIconProps) {
  const [hovered, setHovered] = useState(false);
  const animated = isAnimatedIcon(icon);

  // Use the static (webp) URL by default; swap to animated (gif) on hover
  const url = animated && hovered ? guildIconUrl(guildId, icon) : guildIconUrlStatic(guildId, icon);

  if (url) {
    return (
      <img src={url} alt={name} className={`rounded-full ${className}`} onMouseEnter={animated ? () => setHovered(true) : undefined} onMouseLeave={animated ? () => setHovered(false) : undefined} />
    );
  }

  // Initials fallback — grey circle with initials, like Discord
  const initials = guildInitials(name);

  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-ui-border text-ui-text-primary font-medium select-none text-xs ${className}`} aria-label={name}>
      {initials}
    </div>
  );
}
