/**
 * EmbedEditor — Reusable Discord embed customization component.
 *
 * Provides fields for title, description, color, image, thumbnail, and footer.
 * Used across rolebuttons, tickets, sticky messages, moderation DMs, and welcome.
 */
"use client";

import TextInput from "./TextInput";
import Textarea from "./Textarea";

// ── Types ────────────────────────────────────────────────

export interface EmbedData {
  title?: string;
  description?: string;
  color?: string;
  image?: string;
  thumbnail?: string;
  footer?: string;
}

interface EmbedEditorProps {
  value: EmbedData;
  onChange: (value: EmbedData) => void;
  disabled?: boolean;
  /** Hide the heading (useful when the parent already has a label) */
  hideHeading?: boolean;
  /** Custom heading text (default: "Embed") */
  heading?: string;
  /** Description rows for the description textarea (default: 4). Set to 0 to hide. */
  descriptionRows?: number;
  /** Placeholder text for the description field */
  descriptionPlaceholder?: string;
  /** Show a compact layout with fewer rows */
  compact?: boolean;
}

// ── Component ────────────────────────────────────────────

export default function EmbedEditor({ value, onChange, disabled, hideHeading, heading = "Embed", descriptionRows = 4, descriptionPlaceholder, compact }: EmbedEditorProps) {
  const update = (field: keyof EmbedData, val: string) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div className="space-y-3">
      {!hideHeading && <h3 className="text-sm font-semibold text-zinc-200">{heading}</h3>}

      <TextInput label="Title" value={value.title ?? ""} onChange={(v) => update("title", v)} disabled={disabled} placeholder="Embed title" />

      {descriptionRows !== 0 && (
        <Textarea
          label="Description"
          value={value.description ?? ""}
          onChange={(v) => update("description", v)}
          disabled={disabled}
          rows={compact ? 2 : descriptionRows}
          placeholder={descriptionPlaceholder}
          maxLength={4096}
        />
      )}

      <TextInput label="Color (hex)" value={value.color ?? ""} onChange={(v) => update("color", v)} disabled={disabled} placeholder="#5865f2" />

      <TextInput
        label="Image URL"
        description="Large image displayed at the bottom of the embed"
        value={value.image ?? ""}
        onChange={(v) => update("image", v)}
        disabled={disabled}
        placeholder="https://…"
      />

      <TextInput
        label="Thumbnail URL"
        description="Small image displayed in the top-right of the embed"
        value={value.thumbnail ?? ""}
        onChange={(v) => update("thumbnail", v)}
        disabled={disabled}
        placeholder="https://…"
      />

      <TextInput label="Footer" value={value.footer ?? ""} onChange={(v) => update("footer", v)} disabled={disabled} placeholder="Footer text" />
    </div>
  );
}
