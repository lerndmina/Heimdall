/**
 * TriStateSlider — Discord-style three-state permission toggle.
 *
 * States: deny (✕) → inherit (─) → allow (✓)
 * Renders a compact slider with colored indicator.
 */
"use client";

export type TriState = "deny" | "inherit" | "allow";

interface TriStateSliderProps {
  value: TriState;
  onChange: (value: TriState) => void;
  disabled?: boolean;
  /** Show mixed state indicator (dash) instead of normal inherit */
  mixed?: boolean;
}

const stateIndex: Record<TriState, number> = { deny: 0, inherit: 1, allow: 2 };
const indexState: TriState[] = ["deny", "inherit", "allow"];

export default function TriStateSlider({ value, onChange, disabled = false, mixed = false }: TriStateSliderProps) {
  const idx = stateIndex[value];

  const cycle = () => {
    if (disabled) return;
    const next = indexState[(idx + 1) % 3]!;
    onChange(next);
  };

  // Slider track colours
  const trackColour = value === "deny" ? "bg-red-500/20" : value === "allow" ? "bg-emerald-500/20" : "bg-zinc-700";

  // Thumb position
  const thumbPosition = value === "deny" ? "left-0" : value === "allow" ? "left-[calc(100%-1.25rem)]" : "left-[calc(50%-0.625rem)]";

  // Thumb colour
  const thumbColour = value === "deny" ? "bg-red-500" : value === "allow" ? "bg-emerald-500" : "bg-zinc-500";

  // Icon inside thumb
  const icon =
    value === "deny" ? (
      // ✕
      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ) : value === "allow" ? (
      // ✓
      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    ) : mixed ? (
      // Mixed indicator (small circle)
      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    ) : (
      // ─ (dash)
      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
      </svg>
    );

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={disabled}
      title={value === "deny" ? "Denied" : value === "allow" ? "Allowed" : mixed ? "Mixed" : "Inherit"}
      className={`relative inline-flex h-5 w-13 items-center rounded-full transition-colors ${trackColour} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span className={`absolute flex h-5 w-5 items-center justify-center rounded-full shadow transition-all ${thumbColour} ${thumbPosition}`}>{icon}</span>
    </button>
  );
}
