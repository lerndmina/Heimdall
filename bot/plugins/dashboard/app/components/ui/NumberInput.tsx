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
      <label className="block text-sm font-medium text-zinc-200">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {description && <p className="text-xs text-zinc-500">{description}</p>}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        className={`w-full rounded-lg border bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:ring-1 ${
          error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-zinc-700 focus:border-primary-500 focus:ring-primary-500"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
