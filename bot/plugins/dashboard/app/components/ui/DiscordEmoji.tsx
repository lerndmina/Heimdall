/**
 * DiscordEmoji — renders Discord custom emoji strings as image tags with fallback.
 *
 * Supports:
 * - Custom static emoji: <:name:id>
 * - Custom animated emoji: <a:name:id>
 * - Unicode emoji (rendered natively)
 */
"use client";

interface ParsedCustomEmoji {
  animated: boolean;
  name: string;
  id: string;
}

const CUSTOM_EMOJI_REGEX = /^<(a)?:([a-zA-Z0-9_~]+):(\d+)>$/;

function parseCustomEmoji(value: string): ParsedCustomEmoji | null {
  const match = value.trim().match(CUSTOM_EMOJI_REGEX);
  if (!match) return null;

  return {
    animated: Boolean(match[1]),
    name: match[2] || "emoji",
    id: match[3] || "",
  };
}

function buildEmojiCdnUrl(parsed: ParsedCustomEmoji, size: number): string {
  const ext = parsed.animated ? "gif" : "png";
  return `https://cdn.discordapp.com/emojis/${parsed.id}.${ext}?size=${size}&quality=lossless`;
}

export interface DiscordEmojiProps {
  value: string;
  size?: number;
  className?: string;
  withLabel?: boolean;
  label?: string;
}

export default function DiscordEmoji({ value, size = 18, className = "", withLabel = false, label }: DiscordEmojiProps) {
  const raw = value?.trim() ?? "";
  const parsed = parseCustomEmoji(raw);

  if (parsed) {
    const resolvedLabel = label?.trim() || `:${parsed.name}:`;
    return (
      <span className={`inline-flex items-center gap-1 ${className}`.trim()} title={raw}>
        <img
          src={buildEmojiCdnUrl(parsed, Math.max(size, 16))}
          alt={resolvedLabel}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="inline-block align-middle"
        />
        {withLabel && <span className="text-xs text-zinc-300">{resolvedLabel}</span>}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`.trim()} title={raw || "emoji"}>
      <span style={{ fontSize: size, lineHeight: 1 }}>{raw || "😀"}</span>
      {withLabel && label && <span className="text-xs text-zinc-300">{label}</span>}
    </span>
  );
}
