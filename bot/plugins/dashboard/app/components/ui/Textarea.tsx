/**
 * Textarea — styled multiline text field with label.
 */
"use client";

interface TextareaProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  maxLength?: number;
  rows?: number;
}

export default function Textarea({ label, description, value, onChange, placeholder, required, disabled, error, maxLength, rows = 4 }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[var(--color-ui-text-primary)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-ui-danger)]">*</span>}
      </label>
      {description && <p className="text-xs text-[var(--color-ui-text-faint)]">{description}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        rows={rows}
        className={`ui-input w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary-600)_35%,transparent)] ${
          error ? "ui-input-error focus:border-[var(--color-ui-danger)] focus:ring-[color-mix(in_srgb,var(--color-ui-danger)_35%,transparent)]" : "focus:border-primary-600"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      />
      <div className="flex items-center justify-between">
        {error && <p className="text-xs text-[var(--color-ui-danger)]">{error}</p>}
        {maxLength && (
          <p className={`ml-auto text-xs ${value.length > maxLength ? "text-[var(--color-ui-danger)]" : "text-[var(--color-ui-text-faint)]"}`}>
            {value.length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
}
