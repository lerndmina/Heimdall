/**
 * Toggle — styled boolean switch input.
 */
"use client";

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ label, description, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <label className={`flex items-center justify-between gap-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        {description && <p className="text-xs text-zinc-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${
          checked ? "bg-primary-600" : "bg-zinc-700"
        }`}>
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </label>
  );
}
