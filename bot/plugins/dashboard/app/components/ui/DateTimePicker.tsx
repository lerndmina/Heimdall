/**
 * DateTimePicker — calendar date + time picker for scheduling future events.
 *
 * Uses native HTML datetime-local input styled to match the dashboard theme.
 */
"use client";

interface DateTimePickerProps {
  label?: string;
  description?: string;
  /** ISO 8601 string or empty */
  value: string;
  onChange: (isoString: string) => void;
  /** Minimum allowed date (ISO string) */
  min?: string;
  disabled?: boolean;
  error?: string;
}

export default function DateTimePicker({ label, description, value, onChange, min, disabled, error }: DateTimePickerProps) {
  // Convert ISO to datetime-local format (YYYY-MM-DDTHH:MM)
  const toLocalInput = (iso: string): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleChange = (localValue: string) => {
    if (!localValue) {
      onChange("");
      return;
    }
    const d = new Date(localValue);
    if (isNaN(d.getTime())) return;
    onChange(d.toISOString());
  };

  const minLocal = min ? toLocalInput(min) : undefined;

  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-zinc-200">{label}</label>}
      {description && <p className="text-xs text-zinc-500">{description}</p>}
      <input
        type="datetime-local"
        value={toLocalInput(value)}
        onChange={(e) => handleChange(e.target.value)}
        min={minLocal}
        disabled={disabled}
        className={`w-full rounded-lg border bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:ring-1 scheme-dark ${
          error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-zinc-700 focus:border-primary-500 focus:ring-primary-500"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
