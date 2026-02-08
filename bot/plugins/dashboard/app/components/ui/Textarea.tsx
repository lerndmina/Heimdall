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
      <label className="block text-sm font-medium text-zinc-200">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {description && <p className="text-xs text-zinc-500">{description}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        rows={rows}
        className={`w-full rounded-lg border bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:ring-1 resize-y ${
          error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-zinc-700 focus:border-primary-500 focus:ring-primary-500"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      />
      <div className="flex items-center justify-between">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {maxLength && (
          <p className={`ml-auto text-xs ${value.length > maxLength ? "text-red-400" : "text-zinc-500"}`}>
            {value.length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
}
