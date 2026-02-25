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

export type EmbedMessageMode = "text" | "embed" | "both";

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
  /** Enable shared message-mode controls (text/embed/both) */
  showMessageModeControls?: boolean;
  /** Selected mode when message-mode controls are enabled */
  messageMode?: EmbedMessageMode;
  /** Callback for changing message mode */
  onMessageModeChange?: (mode: EmbedMessageMode) => void;
  /** Plain text content value for text or both mode */
  textContent?: string;
  /** Callback for changing plain text content */
  onTextContentChange?: (value: string) => void;
  /** Label for plain text content editor */
  textContentLabel?: string;
  /** Placeholder for plain text content editor */
  textContentPlaceholder?: string;
  /** Max length for plain text content editor */
  textContentMaxLength?: number;
}

// ── Component ────────────────────────────────────────────

export default function EmbedEditor({
  value,
  onChange,
  disabled,
  hideHeading,
  heading = "Embed",
  descriptionRows = 4,
  descriptionPlaceholder,
  compact,
  showMessageModeControls,
  messageMode = "embed",
  onMessageModeChange,
  textContent,
  onTextContentChange,
  textContentLabel = "Message Content",
  textContentPlaceholder = "Message text",
  textContentMaxLength = 2000,
}: EmbedEditorProps) {
  const update = (field: keyof EmbedData, val: string) => {
    onChange({ ...value, [field]: val });
  };

  const shouldRenderText = !showMessageModeControls || messageMode === "text" || messageMode === "both";
  const shouldRenderEmbed = !showMessageModeControls || messageMode === "embed" || messageMode === "both";

  return (
    <div className="space-y-3">
      {!hideHeading && <h3 className="text-sm font-semibold text-ui-text-primary">{heading}</h3>}

      {showMessageModeControls && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-ui-text-primary">Send Mode</label>
          <select
            value={messageMode}
            disabled={disabled}
            onChange={(event) => onMessageModeChange?.(event.target.value as EmbedMessageMode)}
            className="ui-input w-full rounded-lg border px-3 py-2 text-sm transition focus:outline-none focus:ring-1 focus:ring-primary-500/30">
            <option value="embed">Embed only</option>
            <option value="text">Text only</option>
            <option value="both">Embed + text</option>
          </select>
        </div>
      )}

      {shouldRenderText && onTextContentChange && (
        <Textarea
          label={textContentLabel}
          value={textContent ?? ""}
          onChange={onTextContentChange}
          disabled={disabled}
          rows={compact ? 2 : 4}
          placeholder={textContentPlaceholder}
          maxLength={textContentMaxLength}
        />
      )}

      {shouldRenderEmbed && <TextInput label="Title" value={value.title ?? ""} onChange={(v) => update("title", v)} disabled={disabled} placeholder="Embed title" />}

      {shouldRenderEmbed && descriptionRows !== 0 && (
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

      {shouldRenderEmbed && <TextInput label="Color (hex)" value={value.color ?? ""} onChange={(v) => update("color", v)} disabled={disabled} placeholder="#5865f2" />}

      {shouldRenderEmbed && (
        <TextInput
          label="Image URL"
          description="Large image displayed at the bottom of the embed"
          value={value.image ?? ""}
          onChange={(v) => update("image", v)}
          disabled={disabled}
          placeholder="https://…"
        />
      )}

      {shouldRenderEmbed && (
        <TextInput
          label="Thumbnail URL"
          description="Small image displayed in the top-right of the embed"
          value={value.thumbnail ?? ""}
          onChange={(v) => update("thumbnail", v)}
          disabled={disabled}
          placeholder="https://…"
        />
      )}

      {shouldRenderEmbed && <TextInput label="Footer" value={value.footer ?? ""} onChange={(v) => update("footer", v)} disabled={disabled} placeholder="Footer text" />}
    </div>
  );
}
