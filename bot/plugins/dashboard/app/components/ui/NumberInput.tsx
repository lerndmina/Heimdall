/**
 * NumberInput — styled number field with label.
 */
"use client";

interface NumberInputProps {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

export default function NumberInput({ label, description, value, onChange, min, max, required, disabled, error }: NumberInputProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ui-text-primary">
        {label}
        {required && <span className="ml-1 text-ui-danger">*</span>}
      </label>
      {description && <p className="text-xs text-ui-text-faint">{description}</p>}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        className={`ui-input w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary-600)_35%,transparent)] ${
          error ? "ui-input-error focus:border-ui-danger focus:ring-[color-mix(in_srgb,var(--color-ui-danger)_35%,transparent)]" : "focus:border-primary-600"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      />
      {error && <p className="text-xs text-ui-danger">{error}</p>}
    </div>
  );
}
